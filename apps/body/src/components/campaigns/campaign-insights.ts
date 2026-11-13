import {
   CAMPAIGN_TREND_GATE,
   type CampaignCapacityMissing,
   type CampaignInsights,
   type CampaignProjection,
   type CampaignProjectionHidden,
   type CampaignTrendDay,
} from '@automatedLinkedIn/contracts'

type Gate = CampaignInsights['gate']
type Basis = Extract<CampaignProjection, { status: 'shown' }>['basis']

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const gateMessage = (gate: Gate) => {
   if (gate.missingDays > 0) {
      return `${plural(gate.missingDays, 'complete day')} in the last ${CAMPAIGN_TREND_GATE.completeDays} have no data.`
   }
   if (gate.needed.days > 0) return `${plural(gate.needed.days, 'more complete day')} needed before a projection.`
   if (gate.needed.invites > 0) return `${plural(gate.needed.invites, 'more invite')} needed before a projection.`
   return null
}

const HIDDEN_COPY: Record<Exclude<CampaignProjectionHidden, 'tooEarly'>, string> = {
   noAccounts: 'No usable account, so no invites can be sent.',
   zeroCap: 'Invite limit is zero, so no invites can be sent.',
   paused: 'Paused, so runs may stop and the pace would not hold.',
   walletLow: 'Data wallet below the floor, so runs may stop and the pace would not hold.',
}

export const projectionNote = (projection: CampaignProjection, gate: Gate) => {
   if (projection.status === 'shown') return null
   if (projection.reason === 'tooEarly') return gateMessage(gate) ?? 'Too early to judge.'
   return HIDDEN_COPY[projection.reason]
}

export const prefersReducedMotion = () =>
   typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A day that is not counted stays null so the chart shows a gap, never a zero.
export const trendPoints = (history: CampaignTrendDay[]) =>
   history.map(entry =>
      entry.state === 'counted'
         ? { day: entry.day, invited: entry.counts.invited, accepted: entry.counts.accepted }
         : { day: entry.day, invited: null, accepted: null }
   )

const SETUP: Record<CampaignCapacityMissing, { label: string; to: string }> = {
   noAccounts: { label: 'Connect a signed-in LinkedIn account', to: '/accounts' },
   noWorkflow: { label: 'Add a workflow that sends invites', to: '/workflows' },
   noDiscoverRun: { label: 'Run a Discover workflow to find people', to: '/workflows' },
}

export const missingSetupItems = (missing: CampaignCapacityMissing[]) => missing.map(key => SETUP[key])

// The network page reads its filters as JSON in the `filters` address parameter.
const networkTo = (filters: Record<string, string[]>) =>
   `/network?filters=${encodeURIComponent(JSON.stringify(filters))}`

export const listStripCounts = (lists: CampaignInsights['lists'], campaignLabel: string) => [
   { label: 'Qualified', value: lists.qualified, to: networkTo({ labels: [campaignLabel], fit: ['STRONG'] }) },
   { label: 'Maybe', value: lists.maybe, to: networkTo({ labels: [campaignLabel], fit: ['MAYBE'] }) },
   {
      label: 'Not yet handled',
      value: lists.notYetHandled,
      to: networkTo({ labels: [campaignLabel], statuses: ['NEW'] }),
   },
]

export const projectionBasis = (basis: Basis) =>
   `Based on ${basis.latestPace.toFixed(1)} invites a day over the last 7 complete days and ${basis.previousPace.toFixed(1)} a day over the 7 before. Capped at this campaign's share: ${basis.share.perDay} a day and ${basis.share.perWeek} a week, split across ${plural(basis.shareDenominator, 'campaign')}.`
