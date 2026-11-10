import { PrismaService } from './prisma.service'

// A judgement is reused for this many days; an older one is judged (and paid for) again.
export const JUDGEMENT_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

const since = (now: Date) => new Date(now.getTime() - JUDGEMENT_DAYS * DAY_MS)

export class IcpJudgementService {
   // The fits judged for these people under this ideal customer within the reuse window, by slug.
   public static async recent(userId: string, icpId: string, slugs: string[], now = new Date()) {
      const rows = await PrismaService.client.icpJudgement.findMany({
         where: {
            userId,
            icpId,
            slug: { in: slugs },
            judgedAt: { gte: since(now) },
         },
         select: {
            slug: true,
            fit: true,
         },
      })

      return new Map(rows.map(({ slug, fit }) => [slug, fit]))
   }

   public static async save(userId: string, icpId: string, slug: string, fit: number, now = new Date()) {
      await PrismaService.client.icpJudgement.upsert({
         where: {
            userId_slug_icpId: {
               userId,
               slug,
               icpId,
            },
         },
         create: {
            userId,
            icpId,
            slug,
            fit,
            judgedAt: now,
         },
         update: {
            fit,
            judgedAt: now,
         },
      })
   }

   // Deletes the judgements older than the reuse window; returns how many.
   public static async prune(now = new Date()) {
      const removed = await PrismaService.client.icpJudgement.deleteMany({ where: { judgedAt: { lt: since(now) } } })

      return removed.count
   }
}
