import { EXCERPT_LENGTH, type PersonItem, mergeBySlug, person, readCommentsSnapshot, readReactionsSnapshot } from 'core'

import { type DataReadKind, type PageKind } from 'generated/prisma/client'

import { ALL_CAP, PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { DataReadService } from './dataRead.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PrismaService } from './prisma.service'
import { type RunMember, WorkflowListService } from './workflowList.service'

// The comments and reactions on one post of the owner's /posts, read on demand and kept like the post read. The
// owner can add the people in them to a list, with why they were found, as a workflow would.

export type EngagementKind = 'comments' | 'reactions'

// "Up to 100" unless the owner asks for all, which still stops at ALL_CAP.
const SOME = 100

const PAGE_KINDS: Record<EngagementKind, PageKind> = {
   comments: 'POST_COMMENTS',
   reactions: 'POST_REACTIONS',
}

const READ_KINDS: Record<EngagementKind, DataReadKind> = {
   comments: 'COMMENTS',
   reactions: 'REACTIONS',
}

const stored = (userId: string, slug: string) =>
   PrismaService.client.pageSnapshot.findMany({
      where: {
         userId,
         slug,
         kind: { in: Object.values(PAGE_KINDS) },
      },
      select: {
         kind: true,
         data: true,
         fetchedAt: true,
      },
   })

// Where each person already is for the owner, so the drawer shows it and does not offer to add them again.
const workspaceOf = async (userId: string, slugs: string[]) => {
   const [members, suppressed] = await Promise.all([
      PrismaService.client.workflowListMember.findMany({
         where: {
            slug: { in: slugs },
            list: { userId },
         },
         select: {
            slug: true,
            list: { select: { name: true } },
         },
      }),
      PrismaService.client.suppression.findMany({
         where: {
            userId,
            slug: { in: slugs },
         },
         select: { slug: true },
      }),
   ])
   const lists = new Map(members.map(({ slug, list }) => [slug, list.name]))
   const blocked = new Set(suppressed.map(({ slug }) => slug))

   return (slug: string | null) => ({
      listName: slug ? (lists.get(slug) ?? null) : null,
      doNotContact: slug ? blocked.has(slug) : false,
   })
}

const memberOf = (item: PersonItem, postUrl: string): RunMember => ({
   slug: item.slug,
   url: item.url,
   name: item.name,
   headline: item.headline,
   location: item.location,
   state: 'UNSCORED',
   postUrl,
   score: null,
   signals: item.signals,
   title: null,
   company: null,
   followers: item.followers,
   matched: [],
   tags: [],
   known: false,
})

export class PostEngagementService {
   // null when the post is not in the owner's /posts.
   public static async detail(userId: string, slug: string) {
      const [post, snapshots] = await Promise.all([LinkedInPostService.bySlug(userId, slug), stored(userId, slug)])

      if (!post) {
         return null
      }

      const of = (kind: EngagementKind) => snapshots.find(snapshot => snapshot.kind === PAGE_KINDS[kind])
      const commentsRow = of('comments')
      const reactionsRow = of('reactions')
      const comments = commentsRow ? readCommentsSnapshot(commentsRow.data) : null
      const reactions = reactionsRow ? readReactionsSnapshot(reactionsRow.data) : null
      const slugs = [...(comments?.items ?? []), ...(reactions?.items ?? [])].flatMap(item =>
         item.slug ? [item.slug] : []
      )
      const where = await workspaceOf(userId, [...new Set(slugs)])

      return {
         post,
         comments:
            comments && commentsRow
               ? {
                    limit: comments.limit,
                    fetchedAt: commentsRow.fetchedAt,
                    items: comments.items.map(item => ({
                       ...item,
                       ...where(item.slug),
                    })),
                 }
               : null,
         reactions:
            reactions && reactionsRow
               ? {
                    limit: reactions.limit,
                    fetchedAt: reactionsRow.fetchedAt,
                    items: reactions.items.map(item => ({
                       ...item,
                       ...where(item.slug),
                    })),
                 }
               : null,
         priceMicros: PRICE_MICROS.engagement,
         limits: {
            some: SOME,
            all: ALL_CAP,
         },
         reads: {
            comments: await DataReadService.latest(userId, 'COMMENTS', slug),
            reactions: await DataReadService.latest(userId, 'REACTIONS', slug),
         },
      }
   }

   // Queues one read of up to 100 (or all) comments or reactions for the worker. null when the post is not the owner's.
   public static async read(userId: string, slug: string, kind: EngagementKind, all: boolean) {
      const post = await LinkedInPostService.bySlug(userId, slug)

      if (!post) {
         return null
      }

      await DataReadService.queue({
         userId,
         kind: READ_KINDS[kind],
         slug,
         variant: all ? 'all' : '',
         operation: kind === 'comments' ? 'post-comments' : 'post-reactions',
         params: {
            posts: post.expandedUrl ?? post.url,
            maxResults: all ? ALL_CAP : SOME,
            ...(kind === 'comments' ? { includeReplies: true } : {}),
         },
      })

      return PostEngagementService.detail(userId, slug)
   }

   // Adds the chosen people from the stored comments and reactions to one of the owner's lists. Anyone already in a
   // list, in /profiles or marked do not contact is skipped. null when the post or the list is not the owner's.
   public static async addToList(userId: string, slug: string, listId: string, slugs: string[]) {
      const known = await PostEngagementService.detail(userId, slug)

      if (!known) {
         return null
      }

      const via = known.post.url
      const wanted = new Set(slugs)
      const people = mergeBySlug([
         ...(known.comments?.items ?? []).flatMap(item =>
            item.slug && item.url && wanted.has(item.slug)
               ? [
                    person({
                       slug: item.slug,
                       url: item.url,
                       name: item.name,
                       headline: item.headline,
                       followers: item.followers,
                       signals: [
                          {
                             type: 'commented',
                             via,
                             at: item.at,
                             excerpt: item.text?.slice(0, EXCERPT_LENGTH) ?? null,
                          },
                       ],
                    }),
                 ]
               : []
         ),
         ...(known.reactions?.items ?? []).flatMap(item =>
            wanted.has(item.slug)
               ? [
                    person({
                       slug: item.slug,
                       url: item.url,
                       name: item.name,
                       headline: item.headline,
                       location: item.location,
                       signals: [
                          {
                             type: 'reacted',
                             via,
                             at: null,
                             excerpt: null,
                          },
                       ],
                    }),
                 ]
               : []
         ),
      ])
      const added = await WorkflowListService.addPicked(
         userId,
         listId,
         people.map(item => memberOf(item, via))
      )

      return added === null
         ? null
         : {
              added,
              skipped: people.length - added,
           }
   }
}
