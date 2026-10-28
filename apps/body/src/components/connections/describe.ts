import { timeAgo } from '../../lib/time-ago'
import { type StateTone } from '../accounts/today'
import { type ConnectionAccount, type ConnectionItem } from './rows'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the line above the list says: how many connections the account has and when they were read, or that a read is going on.
export const readLine = (account: Pick<ConnectionAccount, 'total' | 'readAt' | 'reading'>, now: number) => {
   if (account.reading) {
      return 'Reading the connections from LinkedIn. A long list takes several minutes, and this page updates by itself.'
   }

   return account.readAt === null
      ? 'Not read yet.'
      : `${plural(account.total, 'connection')}. Last read ${timeAgo(account.readAt, new Date(now))}.`
}

// What a connection says about a removal that was asked for; nothing for one that is simply connected. The tones are the ones the
// accounts page uses for its checks.
export const stateOf = (
   row: Pick<ConnectionItem, 'state'> & { startedAt?: string; removedAt?: string; failure?: string },
   now: number
): { label: string; tone: StateTone; line: string } | undefined => {
   switch (row.state) {
      case 'REMOVING':
         return {
            label: 'Removing',
            tone: 'busy',
            line: `Waiting for LinkedIn. Started ${timeAgo(row.startedAt ?? null, new Date(now))}.`,
         }
      case 'REMOVED':
         return {
            label: 'Removed',
            tone: 'muted',
            line: `Removed ${timeAgo(row.removedAt ?? null, new Date(now))}.`,
         }
      case 'GONE':
         return {
            label: 'No longer connected',
            tone: 'muted',
            line: 'LinkedIn no longer lists this person.',
         }
      case 'UNSURE':
         return {
            label: 'Not sure',
            tone: 'warn',
            line: row.failure ?? 'LinkedIn did not show whether the removal took. Read the connections again to check.',
         }
      case 'FAILED':
         return {
            label: 'Not removed',
            tone: 'bad',
            line: row.failure ?? 'The removal could not be done.',
         }
      default:
         return undefined
   }
}

// Why Remove cannot be pressed on a row, in a sentence, or nothing when it can.
export const removeBlocker = (
   row: Pick<ConnectionItem, 'state'>,
   account: Pick<ConnectionAccount, 'reading' | 'removeLeft' | 'problem'>
) => {
   if (account.problem) {
      return 'LinkedIn asked this account to sign in.'
   }

   switch (row.state) {
      case 'REMOVING':
         return 'This connection is being removed.'
      case 'UNSURE':
         return 'Read the connections again to check this one first.'
      case 'REMOVED':
      case 'GONE':
         return 'This person is not on the list any more.'
      default:
         break
   }

   if (account.reading) {
      return 'A read of the connections is going on. Try again when it is done.'
   }

   return account.removeLeft > 0 ? undefined : 'This account has used its removals for today.'
}

export type MessageAction =
   // The conversation the account already has with this person, in the Unibox.
   | { kind: 'UNIBOX'; to: string }
   // LinkedIn's own message window, for a person the account has no conversation with yet. Nothing is sent from here.
   | { kind: 'LINKEDIN'; href: string }
   | { kind: 'NONE' }

export const messageAction = (row: Pick<ConnectionItem, 'conversationId' | 'messageUrn'>): MessageAction => {
   if (row.conversationId) {
      return {
         kind: 'UNIBOX',
         to: `/unibox/${encodeURIComponent(row.conversationId)}`,
      }
   }

   return row.messageUrn
      ? {
           kind: 'LINKEDIN',
           href: `https://www.linkedin.com/messaging/compose/?profileUrn=${encodeURIComponent(row.messageUrn)}`,
        }
      : { kind: 'NONE' }
}

// "Connected Oct 27, 2026". The day is a calendar day, so it is written in UTC and never moved by the viewer's zone.
export const connectedLine = (day: string | undefined, locale?: string) =>
   day
      ? `Connected ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))}`
      : undefined
