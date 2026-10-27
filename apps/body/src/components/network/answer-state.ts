import { type AccountRead, type Held, type NetworkRequest, type NetworkSnapshot, type ReadResult } from './types'

import { timeAgo } from '../../lib/time-ago'
import { type Filter } from './rows'
import { NETWORK_LIMITS } from './rules'

export type Tone = 'good' | 'muted' | 'warn' | 'bad' | 'busy'

// What to show on an empty list: a title and a sentence that fit the chip, and whether to offer a read.
export const emptyView = (filter: Filter, searching: boolean, everRead: boolean) => {
   if (searching) {
      return {
         title: 'No match',
         text: 'No request matches what you typed.',
         read: false,
      }
   }

   if (!everRead) {
      return {
         title: 'Nothing read yet',
         text: 'Read the requests from LinkedIn to see who asked to connect.',
         read: true,
      }
   }

   switch (filter) {
      case 'WAITING':
         return {
            title: 'You are all caught up',
            text: 'No requests are waiting for you.',
            read: true,
         }
      case 'ACCEPTED':
         return {
            title: 'Nobody accepted yet',
            text: 'People you accept here show up in this list.',
            read: false,
         }
      case 'IGNORED':
         return {
            title: 'Nobody ignored yet',
            text: 'People you ignore here show up in this list.',
            read: false,
         }
      default:
         return {
            title: 'Nothing needs a look',
            text: 'A request that is gone, or an answer that is not sure, shows up here.',
            read: false,
         }
   }
}

// "Started 8 s ago", "Started 2 min ago".
const startedText = (startedAt: string | undefined, now: Date) => {
   if (!startedAt) {
      return ''
   }

   const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000))

   return seconds < 60 ? ` Started ${seconds} s ago.` : ` Started ${Math.floor(seconds / 60)} min ago.`
}

// The sentence for a request once the owner has acted: what it is waiting for, or how it ended. Fixed sentences: nothing the
// sender wrote is ever put in one.
export const stateSentence = (request: NetworkRequest, now: Date): string | undefined => {
   switch (request.state) {
      case 'QUEUED':
         return `Waiting for LinkedIn.${startedText(request.startedAt, now)}`
      case 'ACCEPTED':
         return `Accepted ${timeAgo(request.answeredAt ?? null, now)}.`
      case 'IGNORED':
         return `Ignored ${timeAgo(request.answeredAt ?? null, now)}.`
      case 'GONE':
         return 'No longer on LinkedIn. The person may have withdrawn the request, or it was answered somewhere else.'
      case 'UNSURE':
         return 'Not sure if LinkedIn took it. Read the requests again to check.'
      case 'FAILED':
         return request.failure ?? 'This could not be done.'
      default:
         return undefined
   }
}

// The short label a row wears once it is not waiting for the owner any more, with how it should look.
export const stateBadge = (request: NetworkRequest, now: Date): { label: string; tone: Tone } | undefined => {
   switch (request.state) {
      case 'QUEUED':
         return {
            label: request.action === 'IGNORE' ? 'Ignoring…' : 'Accepting…',
            tone: 'busy',
         }
      case 'ACCEPTED':
         return {
            label: `Accepted ${timeAgo(request.answeredAt ?? null, now)}`,
            tone: 'good',
         }
      case 'IGNORED':
         return {
            label: `Ignored ${timeAgo(request.answeredAt ?? null, now)}`,
            tone: 'muted',
         }
      case 'GONE':
         return {
            label: 'No longer there',
            tone: 'warn',
         }
      case 'UNSURE':
         return {
            label: 'Not sure',
            tone: 'warn',
         }
      case 'FAILED':
         return {
            label: 'Could not do it',
            tone: 'bad',
         }
      default:
         return undefined
   }
}

// The explanation under a row that needs one; a plain Accepted or Ignored says enough in its label.
export const detailText = (request: NetworkRequest, now: Date) =>
   request.state === 'ACCEPTED' || request.state === 'IGNORED' ? undefined : stateSentence(request, now)

// "Accepting in 4 s": the few seconds an answer waits in the browser, where it can still be undone.
export const holdText = (held: Held, now: Date) => {
   const seconds = Math.max(1, Math.ceil((held.until - now.getTime()) / 1000))

   return `${held.action === 'ACCEPT' ? 'Accepting' : 'Ignoring'} in ${seconds} s`
}

// Whether the page should look again soon: a read or an answer is in progress.
export const isBusy = (snapshot: NetworkSnapshot | undefined) =>
   snapshot !== undefined &&
   (snapshot.accounts.some(({ reading }) => reading) || snapshot.requests.some(({ state }) => state === 'QUEUED'))

// "Reading from LinkedIn…", "Last read 12 minutes ago", "Nothing read yet"; for several accounts how many are being read, or how long ago
// the oldest read was (the one that is wrong for the most accounts), or how many were never read.
export const readLine = (accounts: Array<Pick<AccountRead, 'readAt' | 'reading'>>, now: Date) => {
   const many = accounts.length > 1
   const reading = accounts.filter(account => account.reading).length

   if (reading > 0) {
      return many ? `Reading ${reading} of ${accounts.length} accounts…` : 'Reading from LinkedIn…'
   }

   const read = accounts.flatMap(({ readAt }) => (readAt ? [readAt] : []))
   const never = accounts.length - read.length

   if (never > 0) {
      return many ? `${never} of ${accounts.length} accounts not read yet` : 'Nothing read yet'
   }

   const [oldest] = [...read].sort()

   return oldest ? `${many ? 'Oldest read' : 'Last read'} ${timeAgo(oldest, now)}` : ''
}

// "2 of 50 answers used today".
export const usageText = (answeredToday: number) => `${answeredToday} of ${NETWORK_LIMITS.perDay} answers used today`

// How many requests wait for the owner (the ones being answered still count).
export const waitingCount = (requests: NetworkRequest[]) =>
   requests.filter(({ state }) => state === 'WAITING' || state === 'QUEUED').length

// Said when LinkedIn counts more requests than the page could read, or when brain cut the list.
export const moreOnLinkedIn = (snapshot: Pick<NetworkSnapshot, 'accounts' | 'requests' | 'cut'>) => {
   if (snapshot.cut) {
      return 'Too many to show at once. Pick fewer accounts to see the rest.'
   }

   const waiting = waitingCount(snapshot.requests)
   const total = snapshot.accounts.reduce((sum, account) => sum + account.total, 0)

   return total > waiting ? `Showing ${waiting} of the ${total} requests on LinkedIn.` : undefined
}

// What the Start anyway dialog says when the browse budget refused: the sentence of brain for one account, and for several how many
// and the first sentence.
export const blockedMessage = (reasons: string[]) => {
   const [first = ''] = reasons

   return reasons.length > 1 ? `${reasons.length} accounts may not browse now. The first says: ${first}` : first
}

// What a read says of the accounts it left out (for a reason other than the budget): how many, and the different sentences.
export const skippedText = (skipped: ReadResult['skipped']) => {
   const reasons = [...new Set(skipped.map(({ reason }) => reason))].slice(0, 2)

   return skipped.length === 0
      ? ''
      : `${skipped.length} ${skipped.length === 1 ? 'account was' : 'accounts were'} left out. ${reasons.join(' ')}`
}
