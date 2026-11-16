import {
   type CampaignCounts,
   DASHBOARD_LIMITS,
   type DashboardOverview,
   type UnavailableKey,
   campaignListStateOf,
} from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { listRowOf } from './campaignList'
import { cutoffOf, dayKeyOf, historyDays, shareOf, sinceOf } from './campaignTrend'
import { CampaignTrendService } from './campaignTrend.service'
import {
   type CampaignAttentionInput,
   type WorkflowInput,
   accountRowsOf,
   attentionOf,
   campaignRowsOf,
   cardsOf,
   ownerSeries,
   runRowsOf,
} from './dashboardRules'
import { DraftService } from './draft.service'
import { FleetHealthService } from './fleetHealth.service'
import { LinkedInInviteService } from './linkedInInvite.service'
import { PositiveReplyService } from './positiveReply.service'
import { PrismaService } from './prisma.service'
import { RoomTodayService } from './roomToday.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'

// The owner's dashboard in one answer (.plan/dashboard-analytics.md). Read only. The reads run in three stages; the pure rules of
// dashboardRules.ts turn them into the overview. A core read that fails rejects the call; a soft read that fails is named in `unavailable`.

const DAY_MS = 24 * 60 * 60 * 1000
const UNAVAILABLE_ORDER: UnavailableKey[] = [
   'status',
   'wallet',
   'replies',
   'drafts',
   'alerts',
   'runs',
   'room',
   'waiting',
]

type Soft<T> = { ok: true; value: T } | { ok: false }
type Capacity = { perDay: number; perWeek: number; usableAccounts: number }
type Campaign = Awaited<ReturnType<typeof CampaignService.list>>[number]

// A read that may fail: the rejection becomes a result, so nothing downstream waits on it or throws because of it.
const soft = <T>(read: Promise<T>): Promise<Soft<T>> =>
   read.then(
      (value): Soft<T> => ({
         ok: true,
         value,
      }),
      (): Soft<T> => ({ ok: false })
   )

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`)

export class DashboardService {
   public static async overview(userId: string, isAdmin: boolean, now = new Date()): Promise<DashboardOverview> {
      const db = PrismaService.client
      const end = midnight(cutoffOf(now))
      const [chartFrom] = historyDays(DASHBOARD_LIMITS.chartDays, end)
      const [currentDay] = historyDays(DASHBOARD_LIMITS.windowDays, end)
      const [previousDay] = historyDays(
         DASHBOARD_LIMITS.windowDays,
         new Date(end.getTime() - DASHBOARD_LIMITS.windowDays * DAY_MS)
      )
      const currentFrom = midnight(currentDay)
      const previousFrom = midnight(previousDay)
      const dayAfterEnd = new Date(end.getTime() + DAY_MS)
      const campaignsRead = CampaignService.list(userId)
      const firstDaysRead = db.campaignDay.groupBy({
         by: ['campaignId'],
         where: { campaign: { userId } },
         _min: { day: true },
      })
      const dayRowsRead = db.campaignDay.findMany({
         where: {
            campaign: { userId },
            day: {
               gte: chartFrom,
               lte: cutoffOf(now),
            },
         },
         select: {
            campaignId: true,
            day: true,
            found: true,
            qualified: true,
            invited: true,
            accepted: true,
            messaged: true,
            replied: true,
         },
      })
      const capacityRead = soft(LinkedInInviteService.usableCapacityOf(userId, now))
      const workflowsRead = db.workflow.findMany({
         where: { userId },
         select: {
            id: true,
            name: true,
            stage: true,
            enabled: true,
            campaignId: true,
            campaign: { select: { name: true } },
         },
      })
      const accountsRead = FleetHealthService.forUser(userId, now).then(async accounts => ({
         accounts,
         room: await soft(
            RoomTodayService.forAccounts(
               userId,
               accounts.map(({ accountId }) => accountId),
               'invite',
               now
            )
         ),
      }))
      const walletRead = soft(WalletService.belowFloor())
      const pipelineRead = PositiveReplyService.pipeline(userId)
      const draftsRead = soft(DraftService.counts(userId, now))
      const alertsRead = soft(WorkflowService.alerts(userId))

      // Stage B: what needs the campaigns and their days, or the workflows.
      const seriesRead = Promise.all([campaignsRead, firstDaysRead, dayRowsRead]).then(
         ([campaigns, firstDays, dayRows]) => {
            const rows = new Map<string, Map<string, CampaignCounts>>()
            for (const { campaignId, day, ...counts } of dayRows) {
               const days = rows.get(campaignId) ?? new Map<string, CampaignCounts>()
               days.set(day, counts)
               rows.set(campaignId, days)
            }
            const firstDayOf = new Map(firstDays.map(({ campaignId, _min }) => [campaignId, _min.day]))

            return {
               rows,
               firstDayOf,
               ...ownerSeries({
                  campaigns,
                  firstDays: firstDayOf,
                  rows,
                  now,
               }),
            }
         }
      )
      const repliesRead = seriesRead.then(({ windows }) =>
         soft(
            Promise.all([
               PositiveReplyService.countedBetween(userId, currentFrom, dayAfterEnd, windows.coveredIds),
               PositiveReplyService.countedBetween(userId, previousFrom, currentFrom, windows.coveredIds),
               PositiveReplyService.countedBetween(userId, currentFrom, dayAfterEnd, null),
            ])
         )
      )
      const runsRead = workflowsRead.then(workflows =>
         soft(
            db.workflowRun.findMany({
               where: {
                  userId,
                  workflowId: { in: workflows.map(({ id }) => id) },
                  kind: 'MAIN',
                  trigger: { not: 'PREVIEW' },
                  startedAt: { gte: new Date(now.getTime() - DASHBOARD_LIMITS.runDays * DAY_MS) },
               },
               orderBy: { startedAt: 'desc' },
               take: DASHBOARD_LIMITS.runs,
               select: {
                  id: true,
                  workflowId: true,
                  status: true,
                  qualified: true,
                  maybe: true,
                  discarded: true,
                  costMicros: true,
                  startedAt: true,
               },
            })
         )
      )

      // Stage C starts once the campaigns, their first days, the capacity and the workflows are in, without waiting for the rest.
      const waitingRead = Promise.all([campaignsRead, firstDaysRead, capacityRead, workflowsRead]).then(
         ([campaigns, firstDays, capacity, workflows]) =>
            DashboardService.waitingCounts(
               userId,
               campaigns,
               new Map(firstDays.map(({ campaignId, _min }) => [campaignId, _min.day])),
               capacity,
               workflows
            )
      )

      const [
         campaigns,
         workflows,
         fleet,
         pipeline,
         capacity,
         walletLow,
         drafts,
         alerts,
         built,
         replies,
         runs,
         waiting,
      ] = await Promise.all([
         campaignsRead,
         workflowsRead,
         accountsRead,
         pipelineRead,
         capacityRead,
         walletRead,
         draftsRead,
         alertsRead,
         seriesRead,
         repliesRead,
         runsRead,
         waitingRead,
      ])

      const failed = new Set<UnavailableKey>()
      const usable: Capacity = capacity.ok
         ? capacity.value
         : {
              perDay: 0,
              perWeek: 0,
              usableAccounts: 0,
           }
      const walletIsLow = walletLow.ok && walletLow.value

      if (!capacity.ok) failed.add('status')
      if (!walletLow.ok) {
         failed.add('status')
         if (isAdmin) failed.add('wallet')
      }
      if (!replies.ok) failed.add('replies')
      if (!drafts.ok) failed.add('drafts')
      if (!alerts.ok) failed.add('alerts')
      if (!runs.ok) failed.add('runs')
      if (!fleet.room.ok) failed.add('room')
      if (waiting.failed) failed.add('waiting')

      const running = campaigns.filter(({ pausedAt }) => pausedAt === null).length
      const owner = {
         capacity: usable,
         runningCampaigns: running,
         walletLow: walletIsLow,
      }
      const listRows = campaigns.map(campaign =>
         listRowOf({
            campaign,
            owner,
            now,
            firstRowDay: built.firstDayOf.get(campaign.id) ?? null,
            rows: built.rows.get(campaign.id) ?? new Map(),
         })
      )
      const room = fleet.room.ok ? new Map(fleet.room.value.map(({ accountId, left }) => [accountId, left])) : null
      const accounts = accountRowsOf({
         accounts: fleet.accounts,
         room,
      })
      const money = new Map(pipeline.campaigns.map(one => [one.id, one]))
      const { perDay } = shareOf(usable, running, false).share
      const attentionCampaigns = listRows.map(({ id, name, state, pausedAt }): CampaignAttentionInput => ({
         id,
         name,
         paused: pausedAt !== null,
         running: state === 'RUNNING',
         hasInviteWorkflow: workflows.some(
            ({ campaignId, stage, enabled }) => campaignId === id && stage === 'INVITE' && enabled
         ),
         waiting: waiting.counts.get(id) ?? null,
         perDay,
         replies: money.get(id)?.replies ?? 0,
         replyValueUsd: money.get(id)?.replyValueUsd ?? null,
      }))
      const workflowById = new Map(
         workflows.map(({ campaign, ...workflow }): [string, WorkflowInput] => [
            workflow.id,
            {
               id: workflow.id,
               name: workflow.name,
               stage: workflow.stage,
               enabled: workflow.enabled,
               campaignId: workflow.campaignId,
               campaignName: campaign?.name ?? null,
            },
         ])
      )

      return {
         generatedAt: now.toISOString(),
         unavailable: UNAVAILABLE_ORDER.filter(key => failed.has(key)),
         cards: cardsOf({
            windows: built.windows,
            pipeline,
            replyCounts: replies.ok
               ? {
                    covered: {
                       current: replies.value[0],
                       previous: replies.value[1],
                    },
                    totalCurrent: replies.value[2],
                 }
               : null,
            accountCard: accounts.card,
         }),
         series: built.series,
         campaigns: campaignRowsOf({
            listRows,
            perCampaign: built.perCampaign,
            pipeline: pipeline.campaigns,
            projectionKnown: capacity.ok && walletLow.ok,
         }),
         accounts: accounts.rows,
         runs: runs.ok
            ? runRowsOf({
                 runs: runs.value,
                 workflows: workflowById,
              })
            : [],
         attention: attentionOf({
            accounts: fleet.accounts,
            campaigns: attentionCampaigns,
            alerts: alerts.ok
               ? alerts.value.map(({ runId, workflowId, workflowName, finishedAt }) => ({
                    runId,
                    workflowId,
                    workflowName,
                    finishedAt,
                 }))
               : [],
            draftsWaiting: drafts.ok ? drafts.value.waiting : 0,
            walletLow: walletIsLow,
            isAdmin,
            now,
         }),
      }
   }

   // The people waiting for each running campaign that has an enabled Invite workflow, four counts at a time so they never take the
   // whole pool. Skipped when no account can invite or a campaign's daily share is under one invite: the rule has nothing to say then.
   private static async waitingCounts(
      userId: string,
      campaigns: Campaign[],
      firstDays: Map<string, string | null>,
      capacity: Soft<Capacity>,
      workflows: Array<{ campaignId: string | null; stage: string; enabled: boolean }>
   ) {
      const counts = new Map<string, number>()
      if (!capacity.ok || capacity.value.usableAccounts === 0) {
         return {
            counts,
            failed: false,
         }
      }

      const running = campaigns.filter(({ pausedAt }) => pausedAt === null).length
      if (Math.floor(shareOf(capacity.value, running, false).share.perDay) === 0) {
         return {
            counts,
            failed: false,
         }
      }

      const withInvite = new Set(
         workflows.flatMap(({ campaignId, stage, enabled }) =>
            enabled && stage === 'INVITE' && campaignId ? [campaignId] : []
         )
      )
      const targets = campaigns.filter(
         ({ id, workflows: total, pausedAt, createdAt }) =>
            withInvite.has(id) &&
            campaignListStateOf({
               workflows: total,
               paused: pausedAt !== null,
               since: sinceOf(dayKeyOf(createdAt), firstDays.get(id) ?? null),
            }) === 'RUNNING'
      )
      let failed = false

      for (let from = 0; from < targets.length; from += DASHBOARD_LIMITS.waitingBatch) {
         const batch = targets.slice(from, from + DASHBOARD_LIMITS.waitingBatch)
         const results = await Promise.all(batch.map(({ label }) => soft(CampaignTrendService.waiting(userId, label))))

         for (const [index, result] of results.entries()) {
            if (result.ok) counts.set(batch[index].id, result.value)
            else failed = true
         }
      }

      return {
         counts,
         failed,
      }
   }
}
