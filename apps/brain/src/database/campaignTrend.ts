import {
   CAMPAIGN_TREND_GATE,
   type CampaignCounts,
   type CampaignInsights,
   type CampaignProjection,
   type CampaignRange,
   type CampaignTrendDay,
} from '@automatedLinkedIn/contracts'

const DAY_MS = 24 * 60 * 60 * 1000
// The rollup rewrites today and yesterday, so only days before that are final.
const INCOMPLETE_DAYS = 2
const WINDOW_DAYS = CAMPAIGN_TREND_GATE.completeDays
const PACE_DAYS = 7

type Gate = CampaignInsights['gate']
type Capacity = { perDay: number; perWeek: number }

export type TrendContext = {
   creationDay: string
   since: string | null
   cutoff: string
   rows: Map<string, CampaignCounts>
}

export const dayKeyOf = (date: Date) => date.toISOString().slice(0, 10)

// The latest day that is complete. Days after it are still being written.
export const cutoffOf = (now: Date) => dayKeyOf(new Date(now.getTime() - INCOMPLETE_DAYS * DAY_MS))

// `count` days ending today, oldest first.
export const historyDays = (count: number, now: Date) =>
   Array.from({ length: count }, (_, index) => dayKeyOf(new Date(now.getTime() - (count - 1 - index) * DAY_MS)))

// The latest complete days the gate looks at, oldest first.
export const windowDays = (now: Date) => historyDays(WINDOW_DAYS, new Date(now.getTime() - INCOMPLETE_DAYS * DAY_MS))

// Counting starts at the later of the creation day and the first rollup row. Earlier rows are never backfilled.
export const sinceOf = (creationDay: string, firstRowDay: string | null): string | null => {
   if (firstRowDay === null) return null
   return firstRowDay > creationDay ? firstRowDay : creationDay
}

export const trendDays = (days: string[], context: TrendContext): CampaignTrendDay[] =>
   days.map(day => {
      if (day < context.creationDay)
         return {
            day,
            state: 'notStarted',
         }
      if (context.since === null || day < context.since)
         return {
            day,
            state: 'beforeHistory',
         }
      const counts = context.rows.get(day)
      if (counts)
         return {
            day,
            state: 'counted',
            counts,
         }
      return {
         day,
         state: day > context.cutoff ? 'pending' : 'noData',
      }
   })

export const gateOf = (window: CampaignTrendDay[]): Gate => {
   const counted = window.filter(entry => entry.state === 'counted')
   const completeDays = counted.length
   const missingDays = window.filter(entry => entry.state === 'noData').length
   const invites = counted.reduce((sum, entry) => sum + (entry.state === 'counted' ? entry.counts.invited : 0), 0)
   return {
      completeDays,
      missingDays,
      invites,
      needed: {
         days: Math.max(0, WINDOW_DAYS - completeDays),
         invites: Math.max(0, CAMPAIGN_TREND_GATE.invites - invites),
      },
   }
}

export const gatePasses = (gate: Gate) =>
   gate.completeDays === WINDOW_DAYS && gate.missingDays === 0 && gate.invites >= CAMPAIGN_TREND_GATE.invites

const invitedOf = (days: CampaignTrendDay[]) =>
   days.reduce((sum, entry) => sum + (entry.state === 'counted' ? entry.counts.invited : 0), 0)

// Invites per day over the last and the first seven days of the window.
export const paceOf = (window: CampaignTrendDay[]) => ({
   latestPace: invitedOf(window.slice(-PACE_DAYS)) / PACE_DAYS,
   previousPace: invitedOf(window.slice(0, PACE_DAYS)) / PACE_DAYS,
})

// The campaign's share of the account's capacity. `runningCampaigns` includes this campaign when it is running;
// a paused campaign adds itself, so the share does not jump when it is resumed.
export const shareOf = (capacity: Capacity, runningCampaigns: number, pausedSelf: boolean) => {
   const denominator = Math.max(1, runningCampaigns + (pausedSelf ? 1 : 0))
   return {
      share: {
         perDay: capacity.perDay / denominator,
         perWeek: capacity.perWeek / denominator,
      },
      denominator,
   }
}

// Each pace is capped by the daily share and the weekly share; the range spans the two paces.
const rangeFor = (paces: number[], days: number, share: Capacity): CampaignRange => {
   const values = paces.map(pace => Math.min(days * Math.min(pace, share.perDay), (share.perWeek * days) / PACE_DAYS))
   return {
      low: Math.round(Math.min(...values)),
      high: Math.round(Math.max(...values)),
   }
}

export type ProjectionInput = {
   gatePassed: boolean
   usableAccounts: number
   paused: boolean
   walletLow: boolean
   capacity: Capacity
   share: Capacity
   shareDenominator: number
   latestPace: number
   previousPace: number
}

export const projectionOf = (input: ProjectionInput): CampaignProjection => {
   if (!input.gatePassed)
      return {
         status: 'hidden',
         reason: 'tooEarly',
      }
   if (input.usableAccounts === 0)
      return {
         status: 'hidden',
         reason: 'noAccounts',
      }
   if (input.share.perDay === 0 || input.share.perWeek === 0)
      return {
         status: 'hidden',
         reason: 'zeroCap',
      }
   if (input.paused)
      return {
         status: 'hidden',
         reason: 'paused',
      }
   if (input.walletLow)
      return {
         status: 'hidden',
         reason: 'walletLow',
      }
   const paces = [input.latestPace, input.previousPace]
   return {
      status: 'shown',
      next7: rangeFor(paces, PACE_DAYS, input.share),
      next30: rangeFor(paces, 30, input.share),
      basis: {
         latestPace: input.latestPace,
         previousPace: input.previousPace,
         capacity: input.capacity,
         share: input.share,
         shareDenominator: input.shareDenominator,
      },
   }
}

// Messaged and replied are per-day last-touch values, so they are not summed.
export const totalsOf = (history: CampaignTrendDay[], sinceApplies: boolean): CampaignInsights['totals'] => {
   const totals = {
      found: 0,
      qualified: 0,
      invited: 0,
      accepted: 0,
      skippedDays: 0,
      sinceApplies,
   }
   for (const entry of history) {
      if (entry.state === 'noData') totals.skippedDays += 1
      if (entry.state !== 'counted') continue
      totals.found += entry.counts.found
      totals.qualified += entry.counts.qualified
      totals.invited += entry.counts.invited
      totals.accepted += entry.counts.accepted
   }
   return totals
}
