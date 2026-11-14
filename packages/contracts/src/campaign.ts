import { z } from 'zod'

import { PENDING_NOTICE_AT, PENDING_PAUSE_AT, PLATFORM_MAX } from './limits'

// The campaign page (.plan/lead-pipeline-p5-campaign-page.md): how workflows are grouped, the periods, and the one word an account's
// health is told in. Pure, so brain and the page read the same rules.

export const CAMPAIGN_STAGES = [
   'DISCOVER',
   'INVITE',
   'WARM_UP',
   'FIRST_MESSAGE',
   'HAND_OFF',
   'NO_ANSWER',
   'OTHER',
] as const

export type CampaignStage = (typeof CAMPAIGN_STAGES)[number]

export const STAGE_LABELS: Record<CampaignStage, string> = {
   DISCOVER: 'Discover',
   INVITE: 'Invite',
   WARM_UP: 'Warm up',
   FIRST_MESSAGE: 'First message',
   HAND_OFF: 'Hand off',
   NO_ANSWER: 'No answer',
   OTHER: 'Other',
}

export const CAMPAIGN_PERIODS = ['today', '7d', '30d'] as const

export type CampaignPeriod = (typeof CAMPAIGN_PERIODS)[number]

// The trend chart periods. `all` runs back to the campaign's first day, capped (see CAMPAIGN_TREND_ALL_DAYS).
export const CAMPAIGN_TREND_PERIODS = ['7d', '30d', 'all'] as const

export type CampaignTrendPeriod = (typeof CAMPAIGN_TREND_PERIODS)[number]

export const CAMPAIGN_TREND_ALL_DAYS = 365

export const CAMPAIGN_LIMITS = {
   nameMax: 60,
   // The most campaigns an owner keeps.
   perOwner: 50,
   // Under this many people in a group a comparison is shown with its sizes and called a small sample.
   smallSample: 30,
   // Messaged this many days ago with no answer is Silent.
   silentDays: 4,
   // An accept rate under half of the earlier one, on at least this many invites, is an alarm.
   dropMinInvites: 20,
   // Days of the accept rate and of the trouble an account is judged on.
   healthDays: 14,
   troubleDays: 7,
} as const

export const campaignInputSchema = z.object({ name: z.string().trim().min(1).max(CAMPAIGN_LIMITS.nameMax) })

// `lead-<slug>`: the label every person of the campaign carries, at most 30 characters like any label.
export const campaignLabelOf = (name: string) => {
   const slug = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24)
      .replace(/-+$/g, '')

   return `lead-${slug || 'campaign'}`
}

const DAY_MS = 24 * 60 * 60 * 1000

// When a period starts: Today is the day so far in UTC, the others count back from now.
export const periodStart = (period: CampaignPeriod, now = new Date()) =>
   period === 'today'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(now.getTime() - (period === '7d' ? 7 : 30) * DAY_MS)

export const isSmallSample = (people: number) => people < CAMPAIGN_LIMITS.smallSample

export const rateOf = (part: number, whole: number) => (whole === 0 ? null : part / whole)

export const HEALTH_WORDS = ['HEALTHY', 'WARNING', 'PAUSED'] as const

export type Health = (typeof HEALTH_WORDS)[number]

export type HealthSignals = {
   status: 'PENDING' | 'ACTIVE' | 'NEEDS_REAUTH' | 'ERROR' | 'BLOCKED' | 'DISABLED'
   invitesStopped: boolean
   engageStopped: boolean
   pending: number
   // Invites of the last 14 days and of the 14 before, and how many of each were accepted.
   invitesNow: number
   acceptedNow: number
   invitesBefore: number
   acceptedBefore: number
   // Acts that ended UNKNOWN or refused in the last day.
   troubleActs: number
   // A sign-in that failed or a checkpoint in the last 7 days.
   signedOutRecently: boolean
}

// How the account is doing, in one word and the reasons under it. It never says "safe": nobody outside LinkedIn knows.
export const healthOf = (signals: HealthSignals): { word: Health; reasons: string[] } => {
   const paused: string[] = []
   const warning: string[] = []

   if (signals.status === 'DISABLED') {
      paused.push('Paused by you.')
   }

   if (signals.status === 'BLOCKED') {
      paused.push('LinkedIn restricted this account.')
   }

   if (signals.invitesStopped) {
      paused.push('Invites are stopped for now.')
   }

   if (signals.pending >= PENDING_PAUSE_AT) {
      paused.push(`${signals.pending.toLocaleString('en-US')} requests wait: new invites are paused.`)
   } else if (signals.pending >= PENDING_NOTICE_AT) {
      warning.push(
         `${signals.pending.toLocaleString('en-US')} of about ${PLATFORM_MAX.pendingInvites.toLocaleString('en-US')} requests wait.`
      )
   }

   if (['PENDING', 'NEEDS_REAUTH', 'ERROR'].includes(signals.status)) {
      warning.push('Not signed in. Nothing runs until it is.')
   }

   if (signals.engageStopped) {
      warning.push('Reactions and comments are stopped for now.')
   }

   if (signals.signedOutRecently) {
      warning.push('Signed out or asked for a check in the last 7 days.')
   }

   if (signals.troubleActs > 0) {
      warning.push('Some acts were refused or unclear in the last day.')
   }

   if (acceptDropped(signals)) {
      warning.push('Fewer people accept than before.')
   }

   return {
      word: paused.length > 0 ? 'PAUSED' : warning.length > 0 ? 'WARNING' : 'HEALTHY',
      reasons: [...paused, ...warning],
   }
}

// The accept rate fell under half of the one before, with enough invites to say so.
export const acceptDropped = ({
   invitesNow,
   acceptedNow,
   invitesBefore,
   acceptedBefore,
}: Pick<HealthSignals, 'invitesNow' | 'acceptedNow' | 'invitesBefore' | 'acceptedBefore'>) => {
   const before = rateOf(acceptedBefore, invitesBefore)
   const now = rateOf(acceptedNow, invitesNow)

   return (
      invitesNow >= CAMPAIGN_LIMITS.dropMinInvites &&
      invitesBefore >= CAMPAIGN_LIMITS.dropMinInvites &&
      before !== null &&
      before > 0 &&
      now !== null &&
      now < before / 2
   )
}

// The trend shows a projection only after this many complete days with at least this many invites in them.
export const CAMPAIGN_TREND_GATE = {
   completeDays: 14,
   invites: 20,
} as const

export type CampaignTrendState = 'empty' | 'tooEarly' | 'trend'

export type CampaignCounts = {
   found: number
   qualified: number
   invited: number
   accepted: number
   messaged: number
   replied: number
}

// A day with no row is never shown as zero: `notStarted` is before the campaign, `beforeHistory` is before `since`,
// `noData` is a complete day after `since` with no rollup row, `pending` is today or yesterday with no row yet.
export type CampaignTrendDay =
   | { day: string; state: 'counted'; counts: CampaignCounts }
   | { day: string; state: 'notStarted' | 'beforeHistory' | 'noData' | 'pending' }

export type CampaignRange = { low: number; high: number }

export type CampaignProjectionHidden = 'tooEarly' | 'noAccounts' | 'zeroCap' | 'paused' | 'walletLow'

export type CampaignProjection =
   | { status: 'hidden'; reason: CampaignProjectionHidden }
   | {
        status: 'shown'
        next7: CampaignRange
        next30: CampaignRange
        basis: {
           latestPace: number
           previousPace: number
           capacity: { perDay: number; perWeek: number }
           share: { perDay: number; perWeek: number }
           shareDenominator: number
        }
     }

export type CampaignCapacityMissing = 'noAccounts' | 'noWorkflow' | 'noDiscoverRun'

export type CampaignInsights = {
   state: CampaignTrendState
   since: string | null
   // ISO time of the latest rollup row, null when there is none.
   updatedAt: string | null
   history: CampaignTrendDay[]
   // Only the counts that are safe to add across days: messaged and replied are per-day last-touch values.
   totals: Pick<CampaignCounts, 'found' | 'qualified' | 'invited' | 'accepted'> & {
      skippedDays: number
      sinceApplies: boolean
   }
   gate: {
      completeDays: number
      missingDays: number
      invites: number
      needed: { days: number; invites: number }
   }
   projection: CampaignProjection
   lists: { qualified: number; maybe: number; notYetHandled: number }
   capacity: {
      perDay: number
      perWeek: number
      usableAccounts: number
      share: { perDay: number; perWeek: number }
      missing: CampaignCapacityMissing[]
   }
}

export const CAMPAIGN_LIST_STATES = ['NO_WORKFLOWS', 'PAUSED', 'NOT_STARTED', 'RUNNING'] as const

export type CampaignListState = (typeof CAMPAIGN_LIST_STATES)[number]

export const campaignListStateOf = ({
   workflows,
   paused,
   since,
}: {
   workflows: number
   paused: boolean
   since: string | null
}): CampaignListState => {
   if (workflows === 0) return 'NO_WORKFLOWS'
   if (paused) return 'PAUSED'
   if (since === null) return 'NOT_STARTED'
   return 'RUNNING'
}

export type CampaignListNumbers = {
   qualified: number
   invited: number
   // Null when nothing was invited in the window; can pass 100% for invites sent before the window.
   acceptRate: number | null
   replied: number
}

// Numbers cover the last 14 complete days. Null numbers and projection mean "not shown", never zero.
export type CampaignListRow = {
   id: string
   name: string
   workflows: number
   pausedAt: string | null
   createdAt: string
   state: CampaignListState
   numbers: CampaignListNumbers | null
   gate: CampaignInsights['gate']
   projection: CampaignProjection | null
}
