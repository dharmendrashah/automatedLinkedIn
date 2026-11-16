import {
   type AccountRest,
   type CampaignStatus,
   type Change,
   type DashboardOverview,
   type FirstAttention,
   type UnavailableKey,
   formatWhen,
   plural,
   rateOf,
} from '@automatedLinkedIn/contracts'

import { acceptLabel } from '../campaigns/campaign-list-format'
import { formatPipelineUsd } from '../campaigns/pipeline-format'

export type CardText = { big: string; line1: string; line2: string; badge: string | null }

const DASH = '—'

// "+12.5%" with the up icon, "-20.0%" with the down icon, "New" and nothing (empty text) without an icon.
export const badgeOf = (change: Change): { key: 'up' | 'down' | 'none'; text: string } => {
   if (change.kind === 'new') {
      return {
         key: 'none',
         text: 'New',
      }
   }

   if (change.kind === 'none') {
      return {
         key: 'none',
         text: '',
      }
   }

   const up = change.value >= 0

   return {
      key: up ? 'up' : 'down',
      text: `${up ? '+' : '-'}${Math.abs(change.value).toFixed(1)}%`,
   }
}

export const percentText = (rate: number | null, digits: 0 | 1) =>
   rate === null ? DASH : `${(rate * 100).toFixed(digits)}%`

const UNAVAILABLE_WORDS: Record<UnavailableKey, string> = {
   status: 'campaign status',
   wallet: 'wallet check',
   replies: 'reply counts',
   drafts: 'drafts',
   alerts: 'failed runs',
   runs: 'recent runs',
   room: 'invite room',
   waiting: 'waiting counts',
}
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

// The words come in the fixed order above, each once; nothing when all loaded.
export const unavailableText = (keys: readonly UnavailableKey[]) => {
   const words = UNAVAILABLE_ORDER.filter(key => keys.includes(key)).map(key => UNAVAILABLE_WORDS[key])

   return words.length === 0 ? '' : `Some figures could not be loaded: ${words.join(', ')}.`
}

export const campaignStatusText = (status: CampaignStatus) => {
   switch (status) {
      case 'tooEarly':
         return 'Too early'
      case 'needsYou':
         return 'Needs you'
      case 'onHold':
         return 'On hold'
      case 'onTrack':
         return 'No blocker'
      case 'none':
         return DASH
   }
}

export const restingText = (rest: AccountRest, until: string | null, now: Date) => {
   if (rest === 'openEnded') return 'Resting until the next sign-in'

   if (rest === 'timed') return until === null ? 'Resting' : `Resting until ${formatWhen(until, now)}`

   return 'Active'
}

export const firstAttentionText = ({ kind, name, until }: FirstAttention, now: Date) => {
   if (kind === 'needsYou') return `${name} needs you`

   if (kind === 'check') return `${name} needs a look`

   return until === null ? `${name} is resting` : `${name} is resting until ${formatWhen(until, now)}`
}

const accountsLineOf = ({ active, total, firstAttention }: DashboardOverview['cards']['accounts'], now: Date) => {
   if (firstAttention) return firstAttentionText(firstAttention, now)

   if (total === 0) return 'No account yet'

   return active === 0 ? 'No account is active' : 'No account needs you'
}

const accountsBadgeOf = ({ active, needAttention }: DashboardOverview['cards']['accounts']) => {
   if (needAttention > 0) return `${needAttention} ${needAttention === 1 ? 'needs' : 'need'} attention`

   return active > 0 ? 'All clear' : null
}

// The badge of the first three cards comes from `badgeOf` (their `badge` is null); `now` is the overview's `generatedAt`.
export const cardTextsOf = (
   cards: DashboardOverview['cards'],
   now: Date
): Record<'pipeline' | 'qualified' | 'invites' | 'accounts', CardText> => {
   const { pipeline, qualified, invites, accounts } = cards
   const worth =
      pipeline.campaignsWithReplies === 0
         ? 'Replies x monthly worth x 12'
         : `Worth set in ${pipeline.withReplyAndWorth} of ${plural(pipeline.campaignsWithReplies, 'campaign', 'campaigns')}`

   return {
      pipeline: {
         big: pipeline.totalUsd === null ? 'No worth set' : formatPipelineUsd(pipeline.totalUsd),
         line1: plural(pipeline.replies, 'positive reply', 'positive replies'),
         line2: worth,
         badge: null,
      },
      qualified: {
         big: String(qualified.current),
         line1: `Found ${qualified.found}, qualified ${qualified.current}`,
         line2: `${percentText(rateOf(qualified.current, qualified.found), 1)} qualified`,
         badge: null,
      },
      invites: {
         big: String(invites.current),
         line1: `Accepted per invite sent: ${acceptLabel(invites.acceptRate)}`,
         line2: `Accepted: ${invites.accepted}`,
         badge: null,
      },
      accounts: {
         big: `${accounts.active} of ${accounts.total}`,
         line1: `Invite room today: ${accounts.roomToday ?? DASH}`,
         line2: accountsLineOf(accounts, now),
         badge: accountsBadgeOf(accounts),
      },
   }
}
