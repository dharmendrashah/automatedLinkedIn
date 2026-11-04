import { z } from 'zod'

// What a read of an account's own pages hands over (.plan/lead-pipeline-p9-new-reads.md): four files of fixed words, names, profile slugs and
// times. A notification's text is read to classify it and is never kept. The shapes follow the plan; the pages were only partly recorded.

export const NOTIFICATION_KINDS = [
   'viewed',
   'reacted',
   'commented',
   'mentioned',
   'accepted',
   'jobchange',
   'anniversary',
   'birthday',
   'posted',
   'other',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const VIEWER_GROUPS = ['works-at', 'found-through-profile', 'connection-hiring', 'other'] as const

export const FEED_KINDS = ['post', 'lifeEvent', 'promoted'] as const

const text = (max: number) => z.string().trim().max(max)

const slug = text(200).min(1).nullable()

export const notificationsFileSchema = z.object({
   rows: z
      .array(
         z.object({
            kind: z.enum(NOTIFICATION_KINDS),
            name: text(200).nullable(),
            slug,
            // As LinkedIn shows it: 9m, 2h, 1d.
            time: text(20).nullable(),
         })
      )
      .max(200),
})

export const viewersFileSchema = z.object({
   total: z.number().int().min(0).nullable(),
   periodDays: z.number().int().min(1).max(365).nullable(),
   groups: z
      .array(
         z.object({
            kind: z.enum(VIEWER_GROUPS),
            company: text(200).nullable(),
            count: z.number().int().min(0).max(100_000),
         })
      )
      .max(50),
   people: z
      .array(
         z.object({
            name: text(200).nullable(),
            slug,
            headline: text(300).nullable(),
            time: text(20).nullable(),
         })
      )
      .max(50),
})

export const feedFileSchema = z.object({
   posts: z
      .array(
         z.object({
            authorName: text(200).nullable(),
            authorSlug: slug,
            degree: text(10).nullable(),
            hash: text(100).min(1),
            text: text(500),
            time: text(20).nullable(),
            kind: z.enum(FEED_KINDS),
         })
      )
      .max(200),
})

export const MUTUAL_SHOWN = 10

export const mutualFileSchema = z.object({
   people: z
      .array(
         z.object({
            slug: text(200).min(1),
            count: z.number().int().min(0).max(100_000),
            mutual: z
               .array(
                  z.object({
                     name: text(200).nullable(),
                     slug,
                  })
               )
               .max(MUTUAL_SHOWN),
         })
      )
      .max(3),
})

export type NotificationsFile = z.infer<typeof notificationsFileSchema>
export type ViewersFile = z.infer<typeof viewersFileSchema>
export type FeedFile = z.infer<typeof feedFileSchema>
export type MutualFile = z.infer<typeof mutualFileSchema>

// How long each kind of read is kept, in days.
export const READ_KEEP_DAYS = {
   notifications: 30,
   viewers: 30,
   feed: 14,
   mutual: 30,
} as const

const UNIT_MS = {
   s: 1_000,
   m: 60_000,
   min: 60_000,
   h: 3_600_000,
   d: 86_400_000,
   w: 7 * 86_400_000,
   mo: 30 * 86_400_000,
   y: 365 * 86_400_000,
   yr: 365 * 86_400_000,
} as const

const SHOWN = /^(\d{1,3})\s*(s|min|mo|yr|m|h|d|w|y)$/i

// How long ago LinkedIn says something was ("9m", "2h", "1d", "3w"), in milliseconds; null when it says something else.
export const shownAgoMs = (time: string | null): number | null => {
   const found = SHOWN.exec(time?.trim() ?? '')
   const unit = found?.[2]?.toLowerCase()

   return found && unit && unit in UNIT_MS ? Number(found[1]) * UNIT_MS[unit as keyof typeof UNIT_MS] : null
}
