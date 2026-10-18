import { type PersonSnapshotData, readSnapshot } from 'core'

import { PrismaService } from './prisma.service'

// The full profiles the owner has, from a drawer read or a workflow's "Get full profile". Kept only while the person
// is in one of the owner's lists or in /profiles (see RetentionService).

const DAY_MS = 24 * 60 * 60 * 1000

export const RECENT_DAYS = 30

export class PersonSnapshotService {
   public static save(userId: string, slug: string, data: PersonSnapshotData) {
      return PrismaService.client.personSnapshot.upsert({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         create: {
            userId,
            slug,
            data,
         },
         update: {
            data,
            fetchedAt: new Date(),
         },
      })
   }

   // Full profiles read in the last 30 days among these people, by slug, so a run does not pay for them again.
   public static async recent(userId: string, slugs: string[], now = new Date()) {
      if (slugs.length === 0) {
         return new Map<string, PersonSnapshotData>()
      }

      const rows = await PrismaService.client.personSnapshot.findMany({
         where: {
            userId,
            slug: { in: slugs },
            fetchedAt: { gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) },
         },
         select: {
            slug: true,
            data: true,
         },
      })

      return new Map(
         rows.flatMap(({ slug, data }) => {
            const snapshot = readSnapshot(data)

            return snapshot ? [[slug, snapshot] as const] : []
         })
      )
   }
}
