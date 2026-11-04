import { Prisma } from 'generated/prisma/client'

import { CAMPAIGN_LIMITS, type CampaignPeriod, periodStart } from '@automatedLinkedIn/contracts'

import { type CampaignScope, countsFor } from './campaignCounts'
import { FleetHealthService } from './fleetHealth.service'
import { PrismaService } from './prisma.service'

// What the campaign page shows (.plan/lead-pipeline-p5-campaign-page.md): the funnel of a period, the cuts of the invites, the warm-up test,
// the score histogram, and what needs the owner. Read only. A comparison always carries its sizes so the page can call a small sample small.

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

export type Cut = { key: string; label: string; invited: number; accepted: number }

export type NeedsYou = { kind: 'DRAFTS' | 'ACCOUNT' | 'WORKFLOW'; text: string; to: string }

const bump = (cuts: Map<string, Cut>, key: string, label: string, accepted: boolean) => {
   const cut = cuts.get(key) ?? {
      key,
      label,
      invited: 0,
      accepted: 0,
   }

   cut.invited += 1
   cut.accepted += accepted ? 1 : 0
   cuts.set(key, cut)
}

const BANDS = {
   STRONG: 'Strong fit',
   MAYBE: 'Maybe',
   NONE: 'No score',
} as const

export class CampaignStatsService {
   public static async overview(userId: string, campaignId: string, period: CampaignPeriod, now = new Date()) {
      const db = PrismaService.client
      const campaign = await db.campaign.findFirst({
         where: {
            id: campaignId,
            userId,
         },
         select: {
            id: true,
            name: true,
            label: true,
            pausedAt: true,
            createdAt: true,
         },
      })

      if (!campaign) {
         return null
      }

      const workflows = await db.workflow.findMany({
         where: {
            userId,
            campaignId,
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            name: true,
            stage: true,
            enabled: true,
            runs: {
               orderBy: { startedAt: 'desc' },
               take: 1,
               select: {
                  status: true,
                  startedAt: true,
               },
            },
         },
      })
      const scope: CampaignScope = {
         userId,
         label: campaign.label,
         workflowIds: workflows.map(({ id }) => id),
      }
      const from = periodStart(period, now)
      const [counts, silent, histogram, invites, accounts, waiting] = await Promise.all([
         countsFor(scope, from, new Date(now.getTime() + 1)),
         db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
            SELECT count(*) AS "count" FROM "Person"
            WHERE "userId" = ${userId} AND "labels" @> ARRAY[${campaign.label}]::text[] AND "lastSentAt" IS NOT NULL
              AND "lastSentAt" <= ${new Date(now.getTime() - CAMPAIGN_LIMITS.silentDays * DAY_MS)}
              AND ("lastReceivedAt" IS NULL OR "lastReceivedAt" < "lastSentAt")`),
         db.$queryRaw<Array<{ bucket: number; count: number }>>(Prisma.sql`
            SELECT LEAST(floor("score" / 10.0), 9)::int AS "bucket", count(*)::int AS "count" FROM "Person"
            WHERE "userId" = ${userId} AND "labels" @> ARRAY[${campaign.label}]::text[] AND "score" IS NOT NULL
            GROUP BY 1`),
         db.linkedInInvite.findMany({
            where: {
               userId,
               originWorkflowId: { in: scope.workflowIds },
               invitedAt: { gte: from },
            },
            take: 20_000,
            select: {
               slug: true,
               accountId: true,
               noteSent: true,
               acceptedAt: true,
            },
         }),
         FleetHealthService.forUser(userId, now),
         db.draft.aggregate({
            where: {
               userId,
               originWorkflowId: { in: scope.workflowIds },
               state: 'DRAFTED',
               expiresAt: { gt: now },
            },
            _count: true,
            _min: { draftedAt: true },
         }),
      ])
      const slugs = [...new Set(invites.map(({ slug }) => slug))]
      const [people, engaged] = await Promise.all([
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               fit: true,
               labels: true,
            },
         }),
         db.postAct.findMany({
            where: {
               userId,
               slug: { in: slugs },
               state: 'DONE',
            },
            distinct: ['slug'],
            select: { slug: true },
         }),
      ])
      const personOf = new Map(people.map(person => [person.slug, person]))
      const engagedSlugs = new Set(engaged.map(({ slug }) => slug))
      const byBand = new Map<string, Cut>()
      const byNote = new Map<string, Cut>()
      const byAccount = new Map<string, Cut>()
      const warm = {
         invited: 0,
         accepted: 0,
      }
      const control = {
         invited: 0,
         accepted: 0,
      }

      for (const invite of invites) {
         const accepted = invite.acceptedAt !== null
         const person = personOf.get(invite.slug)
         const name = accounts.find(({ accountId }) => accountId === invite.accountId)?.name ?? 'An account'

         bump(byBand, person?.fit ?? 'NONE', BANDS[person?.fit ?? 'NONE'], accepted)
         bump(
            byNote,
            invite.noteSent ? 'with' : 'without',
            invite.noteSent ? 'With a note' : 'Without a note',
            accepted
         )
         bump(byAccount, invite.accountId, name, accepted)

         const group = person?.labels.includes('control') ? control : engagedSlugs.has(invite.slug) ? warm : null

         if (group) {
            group.invited += 1
            group.accepted += accepted ? 1 : 0
         }
      }

      const needsYou: NeedsYou[] = []

      if (waiting._count > 0) {
         const hours = Math.floor((now.getTime() - (waiting._min.draftedAt?.getTime() ?? now.getTime())) / HOUR_MS)

         needsYou.push({
            kind: 'DRAFTS',
            text: `${waiting._count} drafts wait for you (oldest ${hours} h)`,
            to: '/approve',
         })
      }

      for (const account of accounts.filter(({ health }) => health !== 'HEALTHY')) {
         needsYou.push({
            kind: 'ACCOUNT',
            text: `${account.name}: ${account.reasons[0] ?? 'needs a look'}`,
            to: `/accounts/${account.accountId}`,
         })
      }

      for (const workflow of workflows) {
         const [run] = workflow.runs

         if (run?.status === 'FAILED' && now.getTime() - run.startedAt.getTime() < 7 * DAY_MS) {
            needsYou.push({
               kind: 'WORKFLOW',
               text: `${workflow.name} failed in its last run`,
               to: `/workflows/${workflow.id}`,
            })
         }
      }

      const buckets = Array.from(
         { length: 10 },
         (_unused, bucket) => histogram.find(row => row.bucket === bucket)?.count ?? 0
      )

      return {
         campaign,
         workflows: workflows.map(({ runs, ...workflow }) => ({
            ...workflow,
            lastRun: runs[0] ?? null,
         })),
         funnel: {
            ...counts,
            silent: Number(silent[0]?.count ?? 0),
         },
         cuts: {
            byBand: [...byBand.values()],
            byNote: [...byNote.values()],
            byAccount: [...byAccount.values()],
         },
         warmUp: {
            warm,
            control,
         },
         histogram: buckets,
         needsYou,
         accounts,
      }
   }
}
