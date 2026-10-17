import { Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

// Deletes personal data and old records on time (.plan/gtm-phase-3-blocks-triggers.md). Every step is safe to repeat
// and suppression rows are never touched.

const DAY_MS = 24 * 60 * 60 * 1000

export const RETENTION = {
   itemsDays: 14,
   runsDays: 90,
   maybeDays: 30,
   reviewAfterDays: 180,
   reviewGraceDays: 30,
   ledgerMonths: 13,
} as const

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS)

export class RetentionService {
   public static async run(now = new Date()) {
      const db = PrismaService.client
      const ledgerCutoff = new Date(now)

      ledgerCutoff.setUTCMonth(ledgerCutoff.getUTCMonth() - RETENTION.ledgerMonths)

      const itemCutoff = daysBefore(now, RETENTION.itemsDays)
      const items = await db.workflowItem.deleteMany({
         where: {
            createdAt: { lt: itemCutoff },
            OR: [{ keepUntil: null }, { keepUntil: { lt: now } }],
         },
      })
      // What an API call or another workflow passed in holds personal data too.
      const inputs = await db.workflowRun.updateMany({
         where: {
            status: { not: 'RUNNING' },
            startedAt: { lt: itemCutoff },
            input: { not: Prisma.DbNull },
         },
         data: { input: Prisma.DbNull },
      })
      const runs = await db.workflowRun.deleteMany({
         where: {
            status: { not: 'RUNNING' },
            startedAt: { lt: daysBefore(now, RETENTION.runsDays) },
         },
      })
      const maybe = await db.workflowListMember.deleteMany({
         where: {
            state: 'MAYBE',
            createdAt: { lt: daysBefore(now, RETENTION.maybeDays) },
         },
      })
      // A person marked for review and not touched or kept since is deleted after the grace period.
      const graceCutoff = daysBefore(now, RETENTION.reviewGraceDays)
      const reviewed = await db.workflowListMember.deleteMany({ where: { reviewAt: { lt: graceCutoff } } })
      const marked = await db.workflowListMember.updateMany({
         where: {
            reviewAt: null,
            updatedAt: { lt: daysBefore(now, RETENTION.reviewAfterDays) },
         },
         data: { reviewAt: now },
      })
      const ledger = await db.spendLedger.deleteMany({ where: { createdAt: { lt: ledgerCutoff } } })
      // A full profile is kept only while the person is in one of the owner's lists or in /profiles.
      const snapshots = await db.$executeRaw`
         DELETE FROM "PersonSnapshot" s
         WHERE NOT EXISTS (
            SELECT 1 FROM "WorkflowListMember" m JOIN "WorkflowList" l ON l."id" = m."listId"
            WHERE l."userId" = s."userId" AND m."slug" = s."slug"
         )
         AND NOT EXISTS (
            SELECT 1 FROM "LinkedInProfile" p
            WHERE p."userId" = s."userId" AND p."slug" = s."slug" AND p."archivedAt" IS NULL
         )`

      return {
         items: items.count,
         inputs: inputs.count,
         runs: runs.count,
         maybe: maybe.count,
         reviewed: reviewed.count,
         marked: marked.count,
         ledger: ledger.count,
         snapshots,
      }
   }
}
