import type {
   CampaignCapacityMissing,
   CampaignCounts,
   CampaignInsights,
   CampaignTrendPeriod,
   CampaignTrendState,
} from '@automatedLinkedIn/contracts'

import { CampaignStatsService } from './campaignStats.service'
import {
   type TrendContext,
   allTimeDays,
   cutoffOf,
   dayKeyOf,
   gateOf,
   gatePasses,
   historyDays,
   paceOf,
   projectionOf,
   shareOf,
   sinceOf,
   totalsOf,
   trendDays,
   windowDays,
} from './campaignTrend'
import { LinkedInInviteService } from './linkedInInvite.service'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

// The trend of a campaign for the campaign page (.plan/campaign-detail-insights.md). Read only; the pure rules live in campaignTrend.ts.

const PERIOD_DAYS: Record<Exclude<CampaignTrendPeriod, 'all'>, number> = {
   '7d': 7,
   '30d': 30,
}

export class CampaignTrendService {
   public static async insights(
      userId: string,
      campaignId: string,
      period: CampaignTrendPeriod,
      now = new Date()
   ): Promise<CampaignInsights | null> {
      const db = PrismaService.client
      const campaign = await db.campaign.findFirst({
         where: {
            id: campaignId,
            userId,
         },
         select: {
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
         select: { id: true },
      })
      const workflowIds = workflows.map(({ id }) => id)
      const people = {
         userId,
         labels: { has: campaign.label },
      }

      const [dayTotals, liveFound, liveInvited, lastRun, capacity, runningCampaigns, walletLow, lists] =
         await Promise.all([
            db.campaignDay.aggregate({
               where: { campaignId },
               _min: { day: true },
               _max: { updatedAt: true },
               _sum: {
                  found: true,
                  qualified: true,
                  invited: true,
                  accepted: true,
                  messaged: true,
                  replied: true,
                  handedOver: true,
                  draftsMade: true,
                  draftsApproved: true,
                  draftsRejected: true,
                  draftsExpired: true,
                  aiCostMicros: true,
               },
            }),
            db.person.count({ where: people }),
            db.linkedInInvite.count({
               where: {
                  userId,
                  originWorkflowId: { in: workflowIds },
               },
            }),
            CampaignStatsService.lastDiscoverRun(userId, campaignId),
            LinkedInInviteService.usableCapacityOf(userId, now),
            db.campaign.count({
               where: {
                  userId,
                  pausedAt: null,
               },
            }),
            WalletService.belowFloor(),
            Promise.all([
               db.person.count({
                  where: {
                     ...people,
                     fit: 'STRONG',
                  },
               }),
               db.person.count({
                  where: {
                     ...people,
                     fit: 'MAYBE',
                  },
               }),
               db.person.count({
                  where: {
                     ...people,
                     status: 'NEW',
                  },
               }),
            ]),
         ])

      const hasRows = dayTotals._min.day !== null
      const anyNonZero = Object.values(dayTotals._sum).some(total => (total ?? 0) > 0)
      const empty = liveFound === 0 && liveInvited === 0 && !anyNonZero

      const creationDay = dayKeyOf(campaign.createdAt)
      const firstRow = dayTotals._min.day ?? creationDay
      const days =
         period === 'all'
            ? allTimeDays(firstRow < creationDay ? firstRow : creationDay, now)
            : historyDays(PERIOD_DAYS[period], now)
      const window = windowDays(now)
      const from = days[0] < window[0] ? days[0] : window[0]
      const dayRows = await db.campaignDay.findMany({
         where: {
            campaignId,
            day: { gte: from },
         },
         select: {
            day: true,
            found: true,
            qualified: true,
            invited: true,
            accepted: true,
            messaged: true,
            replied: true,
         },
      })

      const since = sinceOf(creationDay, hasRows ? dayTotals._min.day : null)
      const context: TrendContext = {
         creationDay,
         since,
         cutoff: cutoffOf(now),
         rows: new Map(dayRows.map(({ day, ...counts }): [string, CampaignCounts] => [day, counts])),
      }
      const history = trendDays(days, context)
      const windowEntries = trendDays(window, context)
      const gate = gateOf(windowEntries)
      const gatePassed = gatePasses(gate)
      const state: CampaignTrendState = empty ? 'empty' : gatePassed ? 'trend' : 'tooEarly'

      const [strong, maybe, notYetHandled] = lists
      const { share, denominator } = shareOf(capacity, runningCampaigns, campaign.pausedAt !== null)
      const missing: CampaignCapacityMissing[] = []
      if (capacity.usableAccounts === 0) missing.push('noAccounts')
      if (workflows.length === 0) missing.push('noWorkflow')
      if (lastRun === null) missing.push('noDiscoverRun')

      return {
         state,
         since,
         updatedAt: dayTotals._max.updatedAt?.toISOString() ?? null,
         history,
         totals: totalsOf(history, since !== null && days[0] < since),
         gate,
         projection: projectionOf({
            gatePassed,
            usableAccounts: capacity.usableAccounts,
            paused: campaign.pausedAt !== null,
            walletLow,
            capacity,
            share,
            shareDenominator: denominator,
            ...paceOf(windowEntries),
         }),
         lists: {
            qualified: strong,
            maybe,
            notYetHandled,
         },
         capacity: {
            perDay: capacity.perDay,
            perWeek: capacity.perWeek,
            usableAccounts: capacity.usableAccounts,
            share,
            missing,
         },
      }
   }
}
