import { parseLinkedInUrl, readPostSnapshot, readSignals } from 'core'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { DataReadService } from './dataRead.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PrismaService } from './prisma.service'

// One post of the owner's /posts by slug: the post they chose to read, its author when the owner knows them, and the
// people in their lists a workflow found from it.

const PEOPLE_SHOWN = 50

const whereSnapshot = (userId: string, slug: string) => ({
   userId_kind_slug: {
      userId,
      kind: 'POST' as const,
      slug,
   },
})

// The author's slug when the owner has them in /profiles or a list, so the drawer can open their profile.
const knownAuthor = async (userId: string, url: string | null) => {
   const slug = url ? parseLinkedInUrl(url, 'profile')?.slug : undefined

   if (!slug) {
      return null
   }

   const [profile, member] = await Promise.all([
      PrismaService.client.linkedInProfile.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { id: true },
      }),
      PrismaService.client.workflowListMember.findFirst({
         where: {
            slug,
            list: { userId },
         },
         select: { id: true },
      }),
   ])

   return profile || member ? slug : null
}

export class PostPageService {
   // The posts the owner already read, by slug, so a workflow can show them without paying again.
   public static async previews(userId: string, slugs: string[]) {
      const rows = await PrismaService.client.pageSnapshot.findMany({
         where: {
            userId,
            kind: 'POST',
            slug: { in: slugs },
         },
         select: {
            slug: true,
            data: true,
         },
      })

      return new Map(rows.map(({ slug, data }) => [slug, readPostSnapshot(data)]))
   }

   // null when the post is not in the owner's /posts.
   public static async detail(userId: string, slug: string) {
      const [post, stored] = await Promise.all([
         LinkedInPostService.bySlug(userId, slug),
         PrismaService.client.pageSnapshot.findUnique({
            where: whereSnapshot(userId, slug),
            select: {
               data: true,
               fetchedAt: true,
            },
         }),
      ])

      if (!post) {
         return null
      }

      const page = stored ? readPostSnapshot(stored.data) : null
      const urls = [...new Set([post.url, post.expandedUrl].filter((url): url is string => Boolean(url)))]
      const members = await PrismaService.client.workflowListMember.findMany({
         where: {
            list: { userId },
            OR: [{ postUrl: { in: urls } }, ...urls.map(url => ({ signals: { array_contains: [{ via: url }] } }))],
         },
         orderBy: [
            {
               score: {
                  sort: 'desc',
                  nulls: 'last',
               },
            },
            { createdAt: 'desc' },
         ],
         take: PEOPLE_SHOWN,
         select: {
            slug: true,
            name: true,
            headline: true,
            state: true,
            status: true,
            score: true,
            signals: true,
            list: { select: { name: true } },
         },
      })

      return {
         slug,
         url: post.url,
         post,
         snapshot:
            page && stored
               ? {
                    ...page,
                    fetchedAt: stored.fetchedAt,
                 }
               : null,
         authorSlug: await knownAuthor(userId, page?.author.url ?? null),
         people: members.map(({ signals, ...member }) => ({
            ...member,
            // What they wrote on this post, when they commented.
            comment: readSignals(signals).find(signal => urls.includes(signal.via))?.excerpt ?? null,
         })),
         readPriceMicros: PRICE_MICROS.engagement,
         read: await DataReadService.latest(userId, 'POST', slug),
      }
   }

   // Queues one post read for the worker. null when the post is not the owner's.
   public static async readFull(userId: string, slug: string) {
      const known = await PostPageService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.post.archivedAt) {
         throw new ConflictError('Restore the post first.')
      }

      await DataReadService.queue({
         userId,
         kind: 'POST',
         slug,
         operation: 'posts',
         params: {
            urls: known.post.expandedUrl ?? known.url,
            maxResults: 1,
         },
      })

      return PostPageService.detail(userId, slug)
   }
}
