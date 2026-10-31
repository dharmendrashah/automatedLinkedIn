import { Prisma } from 'generated/prisma/client'

import { FirstDayUsedService } from './firstDayUsed.service'
import { JobRunService } from './jobRun.service'
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
      // The browsing time of accounts is kept as long as the spend record, for the year graph.
      const browsing = await db.browseUsage.deleteMany({ where: { startedAt: { lt: ledgerCutoff } } })
      // A finished read keeps the link it read; the result itself lives in the snapshot.
      const readCutoff = daysBefore(now, RETENTION.itemsDays)
      const reads = await db.dataRead.deleteMany({ where: { finishedAt: { lt: readCutoff } } })
      // A full profile is kept only while the person is in one of the owner's lists, in /profiles, on My network (and not on Do not
      // contact for every client), a connection of one of the owner's accounts, or in a conversation of one.
      const snapshots = await db.$executeRaw`
         DELETE FROM "PersonSnapshot" s
         WHERE NOT EXISTS (
            SELECT 1 FROM "WorkflowListMember" m JOIN "WorkflowList" l ON l."id" = m."listId"
            WHERE l."userId" = s."userId" AND m."slug" = s."slug"
         )
         AND NOT EXISTS (
            SELECT 1 FROM "Person" pe
            WHERE pe."userId" = s."userId" AND pe."slug" = s."slug"
            AND NOT EXISTS (SELECT 1 FROM "Suppression" x WHERE x."userId" = s."userId" AND x."slug" = s."slug")
         )
         AND NOT EXISTS (
            SELECT 1 FROM "LinkedInProfile" p
            WHERE p."userId" = s."userId" AND p."slug" = s."slug" AND p."archivedAt" IS NULL
         )
         AND NOT EXISTS (
            SELECT 1 FROM "LinkedInConnection" c
            WHERE c."userId" = s."userId" AND c."slug" = s."slug" AND c."status" NOT IN ('REMOVED', 'GONE')
         )
         AND NOT EXISTS (
            SELECT 1 FROM "LinkedInConversation" v
            WHERE v."userId" = s."userId"
            AND v."contactProfileUrl" IN ('https://www.linkedin.com/in/' || s."slug" || '/', 'https://www.linkedin.com/in/' || s."slug")
         )
         AND NOT EXISTS (
            SELECT 1 FROM "LinkedInReply" r
            WHERE r."userId" = s."userId" AND r."recipientSlug" = s."slug" AND r."conversationId" IS NOT NULL
         )`
      // A company page or post is kept only while it is in /companies or /posts and not archived.
      const pages = await db.$executeRaw`
         DELETE FROM "PageSnapshot" s
         WHERE (s."kind" = 'COMPANY' AND NOT EXISTS (
            SELECT 1 FROM "LinkedInCompany" c
            WHERE c."userId" = s."userId" AND c."slug" = s."slug" AND c."archivedAt" IS NULL
         ))
         OR (s."kind" IN ('POST', 'POST_COMMENTS', 'POST_REACTIONS') AND NOT EXISTS (
            SELECT 1 FROM "LinkedInPost" p
            WHERE p."userId" = s."userId" AND p."slug" = s."slug" AND p."archivedAt" IS NULL
         ))`
      // The cron monitor's history of job runs (.plan/cron-monitor.md).
      const jobRuns = await JobRunService.cleanup(now)
      const firstDaysUsed = await FirstDayUsedService.sweep(now)

      return {
         items: items.count,
         inputs: inputs.count,
         runs: runs.count,
         maybe: maybe.count,
         reviewed: reviewed.count,
         marked: marked.count,
         ledger: ledger.count,
         browsing: browsing.count,
         reads: reads.count,
         snapshots,
         pages,
         jobRuns,
         firstDaysUsed,
      }
   }
}
