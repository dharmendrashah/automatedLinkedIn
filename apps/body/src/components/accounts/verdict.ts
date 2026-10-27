import { type AccountBrowse } from '../browsing/types'
import { type AccountStatus } from './types'

import { stateText } from '../browsing/format'
import { bucketOf } from '../browsing/overview'

export type Verdict = 'NEEDS_YOU' | 'PAUSED' | 'FULL' | 'OUTSIDE_HOURS' | 'WAITING' | 'READY' | 'SIGNED_IN'

// SIGNED_IN: the account is active but there is no browsing data for it (yet), so nothing more is claimed.
export const verdictOf = (account: { status: AccountStatus }, browse: AccountBrowse | undefined): Verdict => {
   if (account.status === 'DISABLED') {
      return 'PAUSED'
   }

   if (account.status !== 'ACTIVE') {
      return 'NEEDS_YOU'
   }

   if (!browse) {
      return 'SIGNED_IN'
   }

   if (browse.state === 'NOT_BROWSING') {
      return 'NEEDS_YOU'
   }

   if (bucketOf(browse) === 'FULL') {
      return 'FULL'
   }

   if (browse.state === 'OUTSIDE_HOURS') {
      return 'OUTSIDE_HOURS'
   }

   return browse.state === 'WAITING_FOR_SLOT' ? 'WAITING' : 'READY'
}

const NEEDS: Record<Exclude<AccountStatus, 'ACTIVE' | 'DISABLED'>, string> = {
   PENDING: 'The sign-in was not checked yet. Visits are on hold.',
   NEEDS_REAUTH: 'LinkedIn asks to sign in again. Visits are on hold.',
   ERROR: 'Sign-in check failed. Visits are on hold.',
   BLOCKED: 'LinkedIn restricted this account. Visits are on hold.',
}

// One or two plain sentences for a row: what is wrong and what it means, or what the account can do now.
export const whyText = (account: { status: AccountStatus }, browse: AccountBrowse | undefined) => {
   if (account.status === 'DISABLED') {
      return 'Paused. Visits and planned posts are on hold until you resume.'
   }

   if (account.status !== 'ACTIVE') {
      return NEEDS[account.status]
   }

   return browse ? stateText(browse) : 'Signed in.'
}

// Whether the account is inside its working hours now, for the optional column.
export const hoursNowText = (browse: AccountBrowse | undefined) => {
   if (!browse || browse.state === 'NOT_BROWSING') {
      return '—'
   }

   return browse.state === 'OUTSIDE_HOURS' ? `Opens ${browse.nextAt ?? 'later'}` : 'Inside hours'
}

// The most urgent first: needs you, then full, near full, outside hours, waiting, ready, and paused last.
export const rankOf = (verdict: Verdict, browse: AccountBrowse | undefined) => {
   switch (verdict) {
      case 'NEEDS_YOU':
         return 0
      case 'FULL':
         return 1
      case 'OUTSIDE_HOURS':
         return 3
      case 'WAITING':
         return 4
      case 'PAUSED':
         return 6
      default:
         return browse && bucketOf(browse) === 'NEAR_FULL' ? 2 : 5
   }
}
