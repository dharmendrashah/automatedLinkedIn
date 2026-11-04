import { type Prisma } from 'generated/prisma/client'

import {
   type FeedFile,
   type MutualFile,
   type NotificationKind,
   type NotificationsFile,
   READ_KEEP_DAYS,
   type SignalType,
   type ViewersFile,
   shownAgoMs,
} from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { SignalService } from './signal.service'

// What an account's own pages showed (.plan/lead-pipeline-p9-new-reads.md): the files of a read are stored here, signals are written from
// them, and the blocks read them back. People on Do not contact are never stored. Nothing here opens LinkedIn.

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const EXCERPT = 500

const SIGNAL_OF: Partial<Record<NotificationKind, SignalType>> = {
   viewed: 'viewed',
   reacted: 'engagedOurPost',
   commented: 'engagedOurPost',
   accepted: 'accepted',
   jobchange: 'jobchange',
}

const timeOf = (time: string | null, now: Date) => new Date(now.getTime() - (shownAgoMs(time) ?? 0))

const dayKey = (date: Date) => date.toISOString().slice(0, 10)

const keptDays = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS)

export type OwnImported = { stored: number; dropped: number }

// Everything these reads kept about people, deleted with the person (erasure) or when they go on Do not contact.
export const forgetOwnPages = async (tx: Prisma.TransactionClient, userId: string, slugs: string[]) => {
   const where = {
      userId,
      slug: { in: slugs },
   }

   await tx.accountNotification.deleteMany({ where })
   await tx.profileViewer.deleteMany({ where })
   await tx.mutualRead.deleteMany({ where })
   await tx.feedPost.deleteMany({
      where: {
         userId,
         authorSlug: { in: slugs },
      },
   })
}

export class OwnPagesService {
   // The slugs among these that the owner must not contact: a suppression or the flag on My network.
   private static async blocked(userId: string, slugs: Array<string | null>) {
      const wanted = [...new Set(slugs.flatMap(slug => slug ?? []))]

      if (wanted.length === 0) {
         return new Set<string>()
      }

      const db = PrismaService.client
      const where = {
         userId,
         slug: { in: wanted },
      }
      const [suppressed, flagged] = await Promise.all([
         db.suppression.findMany({
            where,
            select: { slug: true },
         }),
         db.person.findMany({
            where: {
               ...where,
               doNotContact: true,
            },
            select: { slug: true },
         }),
      ])

      return new Set([...suppressed, ...flagged].map(({ slug }) => slug))
   }

   public static async importNotifications(
      userId: string,
      accountId: string,
      file: NotificationsFile,
      now = new Date()
   ): Promise<OwnImported> {
      const blocked = await OwnPagesService.blocked(
         userId,
         file.rows.map(({ slug }) => slug)
      )
      const rows = file.rows.filter(({ slug }) => !slug || !blocked.has(slug))
      const dated = rows.map(row => ({
         ...row,
         at: timeOf(row.time, now),
      }))
      const { count } = await PrismaService.client.accountNotification.createMany({
         data: dated.map(({ kind, slug, at }) => ({
            userId,
            accountId,
            kind,
            slug,
            at,
            key: `${kind}|${slug ?? ''}|${Math.floor(at.getTime() / HOUR_MS)}`,
         })),
         skipDuplicates: true,
      })

      await SignalService.recordPeople(
         userId,
         dated.flatMap(({ kind, slug, at }) => {
            const type = SIGNAL_OF[kind]

            return slug && type
               ? [
                    {
                       slug,
                       type,
                       via: `notification:${kind}`,
                       at,
                    },
                 ]
               : []
         })
      )

      return {
         stored: count,
         dropped: file.rows.length - rows.length,
      }
   }

   public static async importViewers(
      userId: string,
      accountId: string,
      file: ViewersFile,
      now = new Date()
   ): Promise<OwnImported> {
      const blocked = await OwnPagesService.blocked(
         userId,
         file.people.map(({ slug }) => slug)
      )
      const people = file.people.filter(({ slug }) => !slug || !blocked.has(slug))
      const day = dayKey(now)
      const { count } = await PrismaService.client.profileViewer.createMany({
         data: [
            ...file.groups.map(({ kind, company, count: size }) => ({
               userId,
               accountId,
               kind,
               slug: null,
               company,
               count: size,
               at: now,
               key: `${kind}|${company ?? ''}|${day}`,
            })),
            ...people.map(({ slug, time }) => ({
               userId,
               accountId,
               kind: 'person',
               slug,
               company: null,
               count: 1,
               at: timeOf(time, now),
               key: `person|${slug ?? ''}|${day}`,
            })),
         ],
         skipDuplicates: true,
      })

      await SignalService.recordPeople(
         userId,
         people.flatMap(({ slug, time }) =>
            slug
               ? [
                    {
                       slug,
                       type: 'viewed' as const,
                       via: 'viewers',
                       at: timeOf(time, now),
                    },
                 ]
               : []
         )
      )

      return {
         stored: count,
         dropped: file.people.length - people.length,
      }
   }

   public static async importFeed(
      userId: string,
      accountId: string,
      file: FeedFile,
      now = new Date()
   ): Promise<OwnImported> {
      const blocked = await OwnPagesService.blocked(
         userId,
         file.posts.map(({ authorSlug }) => authorSlug)
      )
      const posts = file.posts.filter(({ authorSlug }) => !authorSlug || !blocked.has(authorSlug))
      const { count } = await PrismaService.client.feedPost.createMany({
         data: posts.map(({ authorSlug, hash, text, kind, time }) => ({
            userId,
            accountId,
            authorSlug,
            hash,
            excerpt: text.slice(0, EXCERPT),
            kind,
            at: timeOf(time, now),
         })),
         skipDuplicates: true,
      })

      return {
         stored: count,
         dropped: file.posts.length - posts.length,
      }
   }

   // One row for each person and account; a newer read replaces the older one.
   public static async importMutual(
      userId: string,
      accountId: string,
      file: MutualFile,
      now = new Date()
   ): Promise<OwnImported> {
      const blocked = await OwnPagesService.blocked(
         userId,
         file.people.map(({ slug }) => slug)
      )
      const people = file.people.filter(({ slug }) => !blocked.has(slug))

      for (const { slug, count, mutual } of people) {
         const slugs = mutual.flatMap(({ slug: other }) => other ?? [])

         await PrismaService.client.mutualRead.upsert({
            where: {
               accountId_slug: {
                  accountId,
                  slug,
               },
            },
            create: {
               userId,
               accountId,
               slug,
               count,
               mutual: slugs,
               readAt: now,
            },
            update: {
               count,
               mutual: slugs,
               readAt: now,
            },
         })
      }

      await SignalService.recordPeople(
         userId,
         people
            .filter(({ count }) => count > 0)
            .map(({ slug }) => ({
               slug,
               type: 'mutual' as const,
               via: accountId,
               at: now,
            }))
      )

      return {
         stored: people.length,
         dropped: file.people.length - people.length,
      }
   }

   // The people behind notifications since a time, by slug, with the kinds seen and how many; rows with no person are counted apart.
   public static async notifications(userId: string, accountIds: string[], since: Date, kinds: string[]) {
      const rows = await PrismaService.client.accountNotification.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            at: { gte: since },
            ...(kinds.length > 0 ? { kind: { in: kinds } } : {}),
         },
         select: {
            kind: true,
            slug: true,
            at: true,
         },
         orderBy: { at: 'desc' },
      })
      const people = new Map<string, { kinds: string[]; count: number; latest: Date }>()

      for (const { kind, slug, at } of rows) {
         if (slug) {
            const known = people.get(slug)

            people.set(slug, {
               kinds: known?.kinds.includes(kind) ? known.kinds : [...(known?.kinds ?? []), kind],
               count: (known?.count ?? 0) + 1,
               latest: known?.latest ?? at,
            })
         }
      }

      return {
         rows: rows.length,
         people,
      }
   }

   public static async viewers(userId: string, accountIds: string[], since: Date) {
      const rows = await PrismaService.client.profileViewer.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            at: { gte: since },
         },
         select: {
            kind: true,
            slug: true,
            count: true,
            at: true,
         },
         orderBy: { at: 'desc' },
      })

      return {
         people: [...new Set(rows.flatMap(({ slug }) => slug ?? []))],
         groups: rows.filter(({ kind }) => kind !== 'person').reduce((sum, { count }) => sum + count, 0),
      }
   }

   public static async feed(userId: string, accountIds: string[], since: Date, kinds: string[]) {
      const rows = await PrismaService.client.feedPost.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            at: { gte: since },
            kind: { in: kinds },
         },
         select: {
            authorSlug: true,
            kind: true,
            at: true,
         },
         orderBy: { at: 'desc' },
      })
      const authors = new Map<string, string>()

      for (const { authorSlug, kind } of rows) {
         if (authorSlug && !authors.has(authorSlug)) {
            authors.set(authorSlug, kind)
         }
      }

      return {
         posts: rows.length,
         authors,
      }
   }

   public static async mutual(userId: string, accountIds: string[], slugs: string[]) {
      const rows = await PrismaService.client.mutualRead.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            slug: { in: slugs },
         },
         select: {
            slug: true,
            count: true,
            mutual: true,
         },
         orderBy: { readAt: 'desc' },
      })

      return new Map(
         rows
            .map(
               ({ slug, count, mutual }) =>
                  [
                     slug,
                     {
                        count,
                        mutual,
                     },
                  ] as const
            )
            .reverse()
      )
   }

   // Rows older than their time go: notifications, viewers and mutual reads 30 days, the feed 14. Resolves to the counts.
   public static async cleanup(now = new Date()) {
      const db = PrismaService.client
      const [notifications, viewers, feed, mutual] = await Promise.all([
         db.accountNotification.deleteMany({ where: { at: { lt: keptDays(READ_KEEP_DAYS.notifications, now) } } }),
         db.profileViewer.deleteMany({ where: { at: { lt: keptDays(READ_KEEP_DAYS.viewers, now) } } }),
         db.feedPost.deleteMany({ where: { at: { lt: keptDays(READ_KEEP_DAYS.feed, now) } } }),
         db.mutualRead.deleteMany({ where: { readAt: { lt: keptDays(READ_KEEP_DAYS.mutual, now) } } }),
      ])

      return notifications.count + viewers.count + feed.count + mutual.count
   }
}
