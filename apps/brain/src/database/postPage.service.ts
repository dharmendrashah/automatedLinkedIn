import { type PostSnapshotData, parseLinkedInUrl, readPostSnapshot, readSignals } from 'core'

import { type DataReadKind, type Prisma } from 'generated/prisma/client'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { DataReadService, RECENT_READ_MS } from './dataRead.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PrismaService } from './prisma.service'

// One post of the owner's /posts by slug: the post they chose to read, its author when the owner knows them, and the
// people in their lists a workflow found from it.

const PEOPLE_SHOWN = 50

const readOf = (userId: string, post: { slug: string; url: string; expandedUrl: string | null }) => ({
   userId,
   kind: 'POST' as const,
   slug: post.slug,
   operation: 'posts',
   params: {
      urls: post.expandedUrl ?? post.url,
      maxResults: 1,
   },
})

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

// The author as the owner has them: a person on My network (or saved, about to be) or a company of /companies, with their read.
const authorOf = async (userId: string, author: PostSnapshotData['author'] | undefined) => {
   const kind: 'company' | 'person' = author?.isCompany ? 'company' : 'person'
   const slug = author?.url ? parseLinkedInUrl(author.url, kind === 'company' ? 'company' : 'profile')?.slug : undefined

   if (!author || !slug) {
      return null
   }

   const readKind: DataReadKind = kind === 'company' ? 'COMPANY' : 'PROFILE'
   const latest = await DataReadService.latest(userId, readKind, slug)
   const reading = latest?.status === 'QUEUED' || latest?.status === 'RUNNING'
   const gist = {
      kind,
      slug,
      name: author.name,
      headline: author.headline,
      photo: author.avatar,
      company: null as string | null,
      reading,
      read: latest,
   }

   if (kind === 'company') {
      const [company, page] = await Promise.all([
         LinkedInCompanyService.bySlug(userId, slug),
         PrismaService.client.pageSnapshot.findUnique({
            where: {
               userId_kind_slug: {
                  userId,
                  kind: 'COMPANY',
                  slug,
               },
            },
            select: { fetchedAt: true },
         }),
      ])

      return company
         ? {
              ...gist,
              name: company.name ?? author.name,
              headline: company.industry,
              readAt: page?.fetchedAt ?? null,
           }
         : null
   }

   const [person, profile, snapshot] = await Promise.all([
      PrismaService.client.person.findFirst({
         where: {
            userId,
            slug,
         },
         orderBy: { lastTouchAt: 'desc' },
         select: {
            name: true,
            headline: true,
            company: true,
            photoUrl: true,
         },
      }),
      knownAuthor(userId, author.url),
      PrismaService.client.personSnapshot.findUnique({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { fetchedAt: true },
      }),
   ])

   return person || profile
      ? {
           ...gist,
           name: person?.name ?? author.name,
           headline: person?.headline ?? author.headline,
           photo: person?.photoUrl ?? author.avatar,
           company: person?.company ?? null,
           readAt: snapshot?.fetchedAt ?? null,
        }
      : null
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

      const pictures = await PrismaService.client.person.findMany({
         where: {
            userId,
            slug: { in: members.map(({ slug }) => slug) },
            photoUrl: { not: null },
         },
         orderBy: { lastTouchAt: 'desc' },
         select: {
            slug: true,
            photoUrl: true,
         },
      })
      const photoOf = new Map<string, string>()

      for (const { slug: memberSlug, photoUrl } of pictures) {
         if (photoUrl && !photoOf.has(memberSlug)) {
            photoOf.set(memberSlug, photoUrl)
         }
      }

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
         author: await authorOf(userId, page?.author),
         people: members.map(({ signals, ...member }) => ({
            ...member,
            // The photo of their My network person, when there is one.
            photo: photoOf.get(member.slug) ?? null,

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

      await DataReadService.queue(readOf(userId, known.post))

      return PostPageService.detail(userId, slug)
   }

   // The posts of these read (and paid for) in the last 30 days, which an import or a bulk read leaves alone.
   public static readRecently(userId: string, slugs: string[], now = new Date()) {
      return DataReadService.paidSince(userId, 'POST', slugs, new Date(now.getTime() - RECENT_READ_MS))
   }

   // One read each for the owner's posts matched, except those read in the last 30 days; a read refused now is counted.
   public static async readMany(userId: string, which: Prisma.LinkedInPostWhereInput) {
      const posts = await PrismaService.client.linkedInPost.findMany({
         where: {
            ...which,
            userId,
            archivedAt: null,
         },
         select: {
            slug: true,
            url: true,
            expandedUrl: true,
         },
      })
      const recent = await PostPageService.readRecently(
         userId,
         posts.map(({ slug }) => slug)
      )
      const queued = await DataReadService.queueEach(
         posts.filter(({ slug }) => !recent.has(slug)).map(post => readOf(userId, post))
      )

      return {
         ...queued,
         readRecently: recent.size,
      }
   }
}
