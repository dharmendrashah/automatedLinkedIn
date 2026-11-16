import { RECENT_DAYS } from './personSnapshot.service'
import { PrismaService } from './prisma.service'

// The people Remove duplicates leaves out before anything is paid (.plan/skip-known-posts-and-people.md): the ones the owner is
// connected to or has invited (what the daily connection read and the invites know), and the ones whose full profile was read in the
// last 30 days, so a person judged once is not judged again the next day.

const DAY_MS = 24 * 60 * 60 * 1000

export type SeenRules = { connected: boolean; read: boolean }

export class SeenPeopleService {
   public static async among(userId: string, slugs: string[], rules: SeenRules, now = new Date()) {
      const db = PrismaService.client
      const where = {
         userId,
         slug: { in: slugs },
      }
      const [connected, read] = await Promise.all([
         !rules.connected || slugs.length === 0
            ? []
            : db.person.findMany({
                 where: {
                    ...where,
                    OR: [{ connectedAt: { not: null } }, { inviteState: { not: 'NONE' } }],
                 },
                 select: { slug: true },
              }),
         !rules.read || slugs.length === 0
            ? []
            : db.personSnapshot.findMany({
                 where: {
                    ...where,
                    fetchedAt: { gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) },
                 },
                 select: { slug: true },
              }),
      ])

      return {
         connected: new Set(connected.map(({ slug }) => slug)),
         read: new Set(read.map(({ slug }) => slug)),
      }
   }
}
