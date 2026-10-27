import { type Held, type NetworkRequest, type NetworkSnapshot } from './types'

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
   snapshot !== undefined && (snapshot.reading || snapshot.requests.some(({ state }) => state === 'QUEUED'))

// "Reading from LinkedIn…", "Last read 12 minutes ago", "Nothing read yet".
export const readLine = (snapshot: Pick<NetworkSnapshot, 'readAt' | 'reading'>, now: Date) => {
   if (snapshot.reading) {
      return 'Reading from LinkedIn…'
   }

   return snapshot.readAt ? `Last read ${timeAgo(snapshot.readAt, now)}` : 'Nothing read yet'
}

// "2 of 50 answers used today".
export const usageText = (answeredToday: number) => `${answeredToday} of ${NETWORK_LIMITS.perDay} answers used today`

// How many requests wait for the owner (the ones being answered still count).
export const waitingCount = (requests: NetworkRequest[]) =>
   requests.filter(({ state }) => state === 'WAITING' || state === 'QUEUED').length

// Said when LinkedIn counts more requests than the page could read.
export const moreOnLinkedIn = (snapshot: Pick<NetworkSnapshot, 'total' | 'requests'>) => {
   const waiting = waitingCount(snapshot.requests)

   return snapshot.total > waiting ? `Showing ${waiting} of the ${snapshot.total} requests on LinkedIn.` : undefined
}
