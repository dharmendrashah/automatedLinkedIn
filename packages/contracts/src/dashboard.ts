import type { CampaignListState, CampaignStage } from './campaign'

export const DASHBOARD_LIMITS = {
   chartDays: 90,
   windowDays: 30,
   runs: 50,
   runDays: 30,
   waitingBatch: 4,
} as const

// Literal lists, because contracts has no Prisma dependency; a brain unit test checks them against the Prisma enums.
export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISABLED', 'BLOCKED'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'STOPPED'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export type Change = { kind: 'percent'; value: number } | { kind: 'new' } | { kind: 'none' }
export type AccountRest = 'none' | 'timed' | 'openEnded'
export type AttentionRule =
   | 'account-signed-out'
   | 'account-resting'
   | 'account-health'
   | 'wallet-low'
   | 'run-failed'
   | 'drafts-waiting'
   | 'few-waiting'
   | 'no-worth'
export type CampaignStatus = 'none' | 'tooEarly' | 'needsYou' | 'onHold' | 'onTrack'
export type SeriesKey = 'found' | 'qualified' | 'invited' | 'accepted'
export type UnavailableKey = 'status' | 'wallet' | 'replies' | 'drafts' | 'alerts' | 'runs' | 'room' | 'waiting'
export type FirstAttention = { kind: 'needsYou' | 'resting' | 'check'; name: string; until: string | null }

export type DashboardOverview = {
   generatedAt: string
   unavailable: UnavailableKey[]
   cards: {
      pipeline: {
         totalUsd: number | null
         replies: number
         replyChange: Change
         campaignsWithReplies: number
         withReplyAndWorth: number
      }
      qualified: { current: number; change: Change; found: number }
      invites: { current: number; change: Change; accepted: number; acceptRate: number | null }
      accounts: {
         active: number
         total: number
         needAttention: number
         roomToday: number | null
         firstAttention: FirstAttention | null
      }
   }
   series: Array<{ day: string; counted: number; campaigns: number } & Record<SeriesKey, number | null>>
   campaigns: Array<{
      id: string
      name: string
      state: CampaignListState
      paused: boolean
      status: CampaignStatus
      qualified: number | null
      invited: number | null
      pipelineUsd: number | null
      replyValueUsd: number | null
   }>
   accounts: Array<{
      id: string
      name: string
      email: string
      status: AccountStatus
      rest: AccountRest
      until: string | null
      invitesUsed: number
      invitesLimit: number
      acceptRate: number | null
      pending: number
   }>
   runs: Array<{
      id: string
      workflowId: string
      workflow: string
      stage: CampaignStage
      status: RunStatus
      scored: number | null
      qualified: number | null
      campaign: string | null
      costMicros: number
      startedAt: string
   }>
   attention: Array<{
      id: string
      rule: AttentionRule
      severity: 'high' | 'medium'
      sentence: string
      route: string
      at: string | null
   }>
}

// `current` and `previous` are the covered-only values, `total` the all-campaign value of the current window.
export const changeOf = ({
   current,
   previous,
   total,
   hasCovered,
}: {
   current: number
   previous: number
   total: number
   hasCovered: boolean
}): Change => {
   if (!hasCovered) return total > 0 ? { kind: 'new' } : { kind: 'none' }
   if (previous === 0 && current > 0) return { kind: 'new' }
   if (current === previous) return current === 0 && total > 0 ? { kind: 'new' } : { kind: 'none' }

   const value = (Math.sign(current - previous) * Math.round((Math.abs(current - previous) * 1000) / previous)) / 10

   return value === 0
      ? { kind: 'none' }
      : {
           kind: 'percent',
           value,
        }
}

// An open-ended stop wins over a timed one.
export const accountRestOf = ({ stopped, openEnded }: { stopped: boolean; openEnded: boolean }): AccountRest => {
   if (!stopped) return 'none'

   return openEnded ? 'openEnded' : 'timed'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000
const two = (value: number) => String(value).padStart(2, '0')

// "13 Nov", the date part of `formatWhen`.
export const dayLabel = (at: Date | string) => {
   const date = new Date(at)

   return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

// "09:30 UTC" within 24 hours of `now` (past or future), else "13 Nov 09:30 UTC".
export const formatWhen = (at: Date | string, now: Date) => {
   const date = new Date(at)
   const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`

   return Math.abs(date.getTime() - now.getTime()) <= DAY_MS ? time : `${dayLabel(date)} ${time}`
}

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
