import {
   type AccountStatus,
   type AttentionRule,
   type CampaignCounts,
   type CampaignListRow,
   type CampaignListState,
   type CampaignProjectionHidden,
   type CampaignStage,
   type CampaignStatus,
   type CampaignTrendDay,
   DASHBOARD_LIMITS,
   type DashboardOverview,
   type FirstAttention,
   type RunStatus,
   type SeriesKey,
   accountRestOf,
   changeOf,
   formatWhen,
   plural,
   rateOf,
} from '@automatedLinkedIn/contracts'

import { cutoffOf, dayKeyOf, historyDays, sinceOf, trendDays } from './campaignTrend'
import type { AccountHealth } from './fleetHealth.service'

// The rules behind the dashboard (.plan/dashboard-analytics.md). Pure: data in, data out, no I/O. DashboardService reads and calls them.

export type Totals = Record<SeriesKey, number>
type Window = { current: Totals; previous: Totals }
export type SeriesWindows = { total: Window; covered: Window; coveredIds: string[] }
type CampaignSums = { qualified: number | null; invited: number | null }
type PipelineMoney = { id: string; replyValueUsd: number | null; pipelineUsd: number | null }
type AccountRule = Extract<AttentionRule, 'account-signed-out' | 'account-resting' | 'account-health'>
export type AccountAttention = { rule: AccountRule; severity: 'high' | 'medium'; at: Date | null }

export type CampaignAttentionInput = {
   id: string
   name: string
   paused: boolean
   running: boolean
   hasInviteWorkflow: boolean
   waiting: number | null
   perDay: number
   replies: number
   replyValueUsd: number | null
}

export type RunAlert = { runId: string; workflowId: string; workflowName: string; finishedAt: Date | null }

export type RunInput = {
   id: string
   workflowId: string
   status: RunStatus
   qualified: number
   maybe: number
   discarded: number
   costMicros: number
   startedAt: Date
}

export type WorkflowInput = {
   id: string
   name: string
   stage: CampaignStage
   enabled: boolean
   campaignId: string | null
   campaignName: string | null
}

const SERIES_KEYS: SeriesKey[] = ['found', 'qualified', 'invited', 'accepted']
const SIGNED_OUT: AccountStatus[] = ['NEEDS_REAUTH', 'ERROR', 'BLOCKED']
const FINISHED: RunStatus[] = ['SUCCEEDED', 'PARTIAL']
const SEVERITY_ORDER = {
   high: 0,
   medium: 1,
}
const RULE_ORDER: AttentionRule[] = [
   'account-signed-out',
   'account-resting',
   'account-health',
   'wallet-low',
   'run-failed',
   'drafts-waiting',
   'few-waiting',
   'no-worth',
]

const emptyTotals = (): Totals => ({
   found: 0,
   qualified: 0,
   invited: 0,
   accepted: 0,
})

const addTo = (into: Totals, from: Totals) => {
   for (const key of SERIES_KEYS) into[key] += from[key]
}

// The sum of a campaign's counted days, and how many there were.
const sumDays = (entries: CampaignTrendDay[]) => {
   const totals = emptyTotals()
   let counted = 0

   for (const entry of entries) {
      if (entry.state !== 'counted') continue
      counted += 1
      addTo(totals, entry.counts)
   }

   return {
      totals,
      counted,
   }
}

export const ownerSeries = ({
   campaigns,
   firstDays,
   rows,
   now,
}: {
   campaigns: Array<{ id: string; createdAt: Date }>
   firstDays: Map<string, string | null>
   rows: Map<string, Map<string, CampaignCounts>>
   now: Date
}): { series: DashboardOverview['series']; windows: SeriesWindows; perCampaign: Map<string, CampaignSums> } => {
   const cutoff = cutoffOf(now)
   const size = DASHBOARD_LIMITS.windowDays
   const days = historyDays(DASHBOARD_LIMITS.chartDays, new Date(`${cutoff}T00:00:00.000Z`))
   const firstPreviousDay = days[days.length - 2 * size]
   const trends = campaigns.map(({ id, createdAt }) => {
      const creationDay = dayKeyOf(createdAt)
      const since = sinceOf(creationDay, firstDays.get(id) ?? null)

      return {
         id,
         since,
         trend: trendDays(days, {
            creationDay,
            since,
            cutoff,
            rows: rows.get(id) ?? new Map(),
         }),
      }
   })

   const series = days.map((day, index) => {
      const totals = emptyTotals()
      let counted = 0
      let expected = 0

      for (const { trend } of trends) {
         const entry = trend[index]

         if (entry.state === 'counted') {
            counted += 1
            expected += 1
            addTo(totals, entry.counts)
         } else if (entry.state === 'noData') {
            expected += 1
         }
      }

      return counted > 0
         ? {
              day,
              counted,
              campaigns: expected,
              ...totals,
           }
         : {
              day,
              counted,
              campaigns: expected,
              found: null,
              qualified: null,
              invited: null,
              accepted: null,
           }
   })

   const windows: SeriesWindows = {
      total: {
         current: emptyTotals(),
         previous: emptyTotals(),
      },
      covered: {
         current: emptyTotals(),
         previous: emptyTotals(),
      },
      coveredIds: [],
   }
   const perCampaign = new Map<string, CampaignSums>()

   for (const { id, since, trend } of trends) {
      const current = sumDays(trend.slice(-size))
      const previous = sumDays(trend.slice(-2 * size, -size))
      const covered =
         since !== null && since <= firstPreviousDay && trend.slice(-2 * size).every(({ state }) => state !== 'noData')

      addTo(windows.total.current, current.totals)
      addTo(windows.total.previous, previous.totals)

      if (covered) {
         windows.coveredIds.push(id)
         addTo(windows.covered.current, current.totals)
         addTo(windows.covered.previous, previous.totals)
      }

      perCampaign.set(id, {
         qualified: current.counted > 0 ? current.totals.qualified : null,
         invited: current.counted > 0 ? current.totals.invited : null,
      })
   }

   return {
      series,
      windows,
      perCampaign,
   }
}

// "No blocker" (onTrack) is not a promise: the plan has no target, so it only means no known blocker. When the wallet or the capacity read
// failed the projection cannot be trusted, so everything that depends on it is unknown.
export const campaignStatusOf = ({
   state,
   hiddenReason,
   projectionKnown,
}: {
   state: CampaignListState
   hiddenReason: CampaignProjectionHidden | null
   projectionKnown: boolean
}): CampaignStatus => {
   if (state !== 'RUNNING') return 'none'
   if (hiddenReason === 'tooEarly') return 'tooEarly'
   if (!projectionKnown) return 'none'
   if (hiddenReason === 'noAccounts' || hiddenReason === 'zeroCap') return 'needsYou'
   if (hiddenReason === 'walletLow') return 'onHold'

   return hiddenReason === null ? 'onTrack' : 'none'
}

// The one classifier behind the Active accounts card (K, first attention) and the three account rows of Needs attention.
export const accountAttentionOf = ({ account }: { account: AccountHealth }): AccountAttention | null => {
   if (SIGNED_OUT.includes(account.status))
      return {
         rule: 'account-signed-out',
         severity: 'high',
         at: account.statusUpdatedAt,
      }

   if (account.status !== 'ACTIVE') return null

   if (account.invitesStopped || account.engageStopped)
      return {
         rule: 'account-resting',
         severity: account.stopOpenEnded && account.invitesStopped ? 'high' : 'medium',
         at: account.stopAt,
      }

   return account.health === 'HEALTHY'
      ? null
      : {
           rule: 'account-health',
           severity: 'medium',
           at: null,
        }
}

const firstAttentionOf = (
   found: Array<{ account: AccountHealth; attention: AccountAttention }>
): FirstAttention | null => {
   const high = found.find(({ attention }) => attention.severity === 'high')
   if (high)
      return {
         kind: 'needsYou',
         name: high.account.name,
         until: null,
      }

   const timed = found.find(({ account, attention }) => attention.rule === 'account-resting' && !account.stopOpenEnded)
   if (timed)
      return {
         kind: 'resting',
         name: timed.account.name,
         until: timed.account.stopUntil?.toISOString() ?? null,
      }

   const [first] = found

   return first
      ? {
           kind: 'check',
           name: first.account.name,
           until: null,
        }
      : null
}

export const accountRowsOf = ({
   accounts,
   room,
}: {
   accounts: AccountHealth[]
   room: Map<string, number> | null
}): { rows: DashboardOverview['accounts']; card: DashboardOverview['cards']['accounts'] } => {
   const rows = accounts.map((account): DashboardOverview['accounts'][number] => {
      const rest =
         account.status === 'ACTIVE'
            ? accountRestOf({
                 stopped: account.invitesStopped || account.engageStopped,
                 openEnded: account.stopOpenEnded,
              })
            : 'none'

      return {
         id: account.accountId,
         name: account.name,
         email: account.email,
         status: account.status,
         rest,
         until: rest === 'timed' ? (account.stopUntil?.toISOString() ?? null) : null,
         invitesUsed: account.invites.used,
         invitesLimit: account.invites.limit,
         acceptRate: rateOf(account.acceptedLast14, account.invitedLast14),
         pending: account.pending.count,
      }
   })
   const found = accounts.flatMap(account => {
      const attention = accountAttentionOf({ account })

      return attention
         ? [
              {
                 account,
                 attention,
              },
           ]
         : []
   })

   return {
      rows,
      card: {
         active: accounts.filter(({ status }) => status === 'ACTIVE').length,
         total: accounts.length,
         needAttention: found.length,
         // An engagement-only stop does not block invites, so that account still has its room.
         roomToday: room
            ? accounts
                 .filter(({ status, invitesStopped }) => status === 'ACTIVE' && !invitesStopped)
                 .reduce((sum, { accountId }) => sum + (room.get(accountId) ?? 0), 0)
            : null,
         firstAttention: firstAttentionOf(found),
      },
   }
}

export const cardsOf = ({
   windows,
   pipeline,
   replyCounts,
   accountCard,
}: {
   windows: SeriesWindows
   pipeline: {
      totalUsd: number | null
      campaigns: Array<{ id: string; replies: number; replyValueUsd: number | null }>
   }
   replyCounts: { covered: { current: number; previous: number }; totalCurrent: number } | null
   accountCard: DashboardOverview['cards']['accounts']
}): DashboardOverview['cards'] => {
   const { total, covered, coveredIds } = windows
   const hasCovered = coveredIds.length > 0
   const withReplies = pipeline.campaigns.filter(({ replies }) => replies > 0)

   return {
      pipeline: {
         totalUsd: pipeline.totalUsd,
         replies: pipeline.campaigns.reduce((sum, { replies }) => sum + replies, 0),
         replyChange: replyCounts
            ? changeOf({
                 current: replyCounts.covered.current,
                 previous: replyCounts.covered.previous,
                 total: replyCounts.totalCurrent,
                 hasCovered,
              })
            : { kind: 'none' },
         campaignsWithReplies: withReplies.length,
         withReplyAndWorth: withReplies.filter(({ replyValueUsd }) => replyValueUsd !== null).length,
      },
      qualified: {
         current: total.current.qualified,
         change: changeOf({
            current: covered.current.qualified,
            previous: covered.previous.qualified,
            total: total.current.qualified,
            hasCovered,
         }),
         found: total.current.found,
      },
      invites: {
         current: total.current.invited,
         change: changeOf({
            current: covered.current.invited,
            previous: covered.previous.invited,
            total: total.current.invited,
            hasCovered,
         }),
         accepted: total.current.accepted,
         acceptRate: rateOf(total.current.accepted, total.current.invited),
      },
      accounts: accountCard,
   }
}

export const campaignRowsOf = ({
   listRows,
   perCampaign,
   pipeline,
   projectionKnown,
}: {
   listRows: CampaignListRow[]
   perCampaign: Map<string, CampaignSums>
   pipeline: PipelineMoney[]
   projectionKnown: boolean
}): DashboardOverview['campaigns'] => {
   const money = new Map(pipeline.map(one => [one.id, one]))

   return listRows.map(({ id, name, state, pausedAt, projection }) => ({
      id,
      name,
      state,
      paused: pausedAt !== null,
      status: campaignStatusOf({
         state,
         hiddenReason: projection?.status === 'hidden' ? projection.reason : null,
         projectionKnown,
      }),
      qualified: perCampaign.get(id)?.qualified ?? null,
      invited: perCampaign.get(id)?.invited ?? null,
      pipelineUsd: money.get(id)?.pipelineUsd ?? null,
      replyValueUsd: money.get(id)?.replyValueUsd ?? null,
   }))
}

export const runRowsOf = ({
   runs,
   workflows,
}: {
   runs: RunInput[]
   workflows: Map<string, WorkflowInput>
}): DashboardOverview['runs'] =>
   runs.flatMap(run => {
      const workflow = workflows.get(run.workflowId)
      if (!workflow) return []

      // The engine writes these counts for any workflow with a scoring step; a run that listed nobody shows a dash.
      const scored = run.qualified + run.maybe + run.discarded
      const counted = FINISHED.includes(run.status) && scored > 0

      return [
         {
            id: run.id,
            workflowId: run.workflowId,
            workflow: workflow.name,
            stage: workflow.stage,
            status: run.status,
            scored: counted ? scored : null,
            qualified: counted ? run.qualified : null,
            campaign: workflow.campaignName,
            costMicros: run.costMicros,
            startedAt: run.startedAt.toISOString(),
         },
      ]
   })

type Found = Omit<DashboardOverview['attention'][number], 'at'> & { at: Date | null }

const accountSentence = (account: AccountHealth, { rule }: AccountAttention, now: Date) => {
   if (rule === 'account-signed-out')
      return account.status === 'NEEDS_REAUTH'
         ? `${account.name} needs you to sign in again.`
         : account.status === 'BLOCKED'
           ? `LinkedIn blocked ${account.name}.`
           : `${account.name} is in error and needs a look.`

   if (rule === 'account-resting')
      return account.stopUntil && !account.stopOpenEnded
         ? `${account.name} is resting until ${formatWhen(account.stopUntil, now)}.`
         : `${account.name} is resting until its next sign-in.`

   return `${account.name}: ${account.reasons[0]}`
}

const accountRows = (accounts: AccountHealth[], now: Date): Found[] =>
   accounts.flatMap(account => {
      const attention = accountAttentionOf({ account })

      return attention
         ? [
              {
                 id: `${attention.rule}:${account.accountId}`,
                 rule: attention.rule,
                 severity: attention.severity,
                 sentence: accountSentence(account, attention, now),
                 route: `/accounts/${account.accountId}`,
                 at: attention.at,
              },
           ]
         : []
   })

// A newer time first, a row with no known start last.
const byTime = (a: Date | null, b: Date | null) => {
   if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1

   return b.getTime() - a.getTime()
}

export const attentionOf = ({
   accounts,
   campaigns,
   alerts,
   draftsWaiting,
   walletLow,
   isAdmin,
   now,
}: {
   accounts: AccountHealth[]
   campaigns: CampaignAttentionInput[]
   alerts: RunAlert[]
   draftsWaiting: number
   walletLow: boolean
   isAdmin: boolean
   now: Date
}): DashboardOverview['attention'] => {
   const rows: Found[] = [
      ...accountRows(accounts, now),
      ...(isAdmin && walletLow
         ? [
              {
                 id: 'wallet-low:platform',
                 rule: 'wallet-low' as const,
                 severity: 'high' as const,
                 sentence: 'The data wallet is below its floor, so paid work may stop.',
                 route: '/usage',
                 at: null,
              },
           ]
         : []),
      ...alerts.map((alert): Found => ({
         id: `run-failed:${alert.runId}`,
         rule: 'run-failed',
         severity: 'high',
         sentence: alert.finishedAt
            ? `A run of ${alert.workflowName} failed on ${formatWhen(alert.finishedAt, now)}.`
            : `A run of ${alert.workflowName} failed.`,
         route: `/workflows/${alert.workflowId}`,
         at: alert.finishedAt,
      })),
      ...(draftsWaiting > 0
         ? [
              {
                 id: 'drafts-waiting:owner',
                 rule: 'drafts-waiting' as const,
                 severity: 'medium' as const,
                 sentence: `${plural(draftsWaiting, 'draft waits', 'drafts wait')} for your approval.`,
                 route: '/approve',
                 at: null,
              },
           ]
         : []),
      ...campaigns.flatMap((campaign): Found[] => {
         if (campaign.paused) return []

         const room = Math.floor(campaign.perDay)
         const rowsOf: Found[] = []

         if (campaign.running && campaign.hasInviteWorkflow && campaign.waiting !== null && campaign.waiting < room)
            rowsOf.push({
               id: `few-waiting:${campaign.id}`,
               rule: 'few-waiting',
               severity: 'medium',
               sentence: `${campaign.name} has ${plural(campaign.waiting, 'person', 'people')} waiting to be invited, fewer than the ${room} it can invite in a day.`,
               route: `/campaigns/${campaign.id}`,
               at: null,
            })

         if (campaign.replies > 0 && campaign.replyValueUsd === null)
            rowsOf.push({
               id: `no-worth:${campaign.id}`,
               rule: 'no-worth',
               severity: 'medium',
               sentence: `${campaign.name} has positive replies but no worth per reply, so it adds no money.`,
               route: `/campaigns/${campaign.id}`,
               at: null,
            })

         return rowsOf
      }),
   ]

   return rows
      .sort(
         (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) ||
            byTime(a.at, b.at) ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      )
      .map(({ at, ...row }) => ({
         ...row,
         at: at?.toISOString() ?? null,
      }))
}
