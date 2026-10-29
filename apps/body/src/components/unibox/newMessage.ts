import {
   type AccountState,
   type Recipient,
   type RecipientSearch,
   type RecipientStatus,
   type UniboxAccount,
   type UniboxConversation,
} from './types'

import { agoOf } from './time'

// The stand-in of a first message sits in the list under this id until the real conversation is stored (.plan/message-connections.md).
const PREFIX = 'new:'

export const placeholderId = (accountId: string, slug: string) => `${PREFIX}${accountId}:${slug}`

export const isPlaceholder = (id: string) => id.startsWith(PREFIX)

// A conversation not begun yet, opened from New message so the owner writes the first message in the normal composer.
export const draftConversation = (account: UniboxAccount, { slug, name, imageUrl }: Recipient): UniboxConversation => {
   const contact = {
      name,
      profileUrl: `https://www.linkedin.com/in/${slug}/`,
      ...(imageUrl && { imageUrl }),
   }

   return {
      id: placeholderId(account.id, slug),
      accountId: account.id,
      contact,
      participants: [contact],
      kind: 'DIRECT',
      unread: false,
      complete: true,
      messages: [],
      starting: { slug },
   }
}

// The same words in the popup's chips, its filter and the person's hover card.
export const STATUS_WORDS: Record<RecipientStatus, string> = {
   NEEDS_REPLY: 'Needs your reply',
   WAITING: 'Waiting on them',
   TALKED: 'Talked before',
   NEVER: 'Never messaged',
}

export const BLOCKED_WORDS = 'You chose not to message them'

// The owner's other accounts that talk with the person, so a prospect is not written to from two of them.
export const alsoTalking = (
   { alsoWith }: Pick<Recipient, 'alsoWith'>,
   nameOf: (accountId: string) => string | undefined,
   now: number
) => {
   const [first] = alsoWith ?? []

   if (!first) {
      return undefined
   }

   const name = nameOf(first.accountId) ?? 'another account'
   const rest = (alsoWith?.length ?? 1) - 1

   if (rest > 0) {
      return `Also talking from ${name} and ${rest} other ${rest === 1 ? 'account' : 'accounts'}`
   }

   return first.at === undefined ? `Also talking from ${name}` : `Also talking from ${name}, ${agoOf(first.at, now)}`
}

// How many the search found, and that only the first are shown when there are more.
export const countLine = (shown: number, total: number) =>
   shown >= total
      ? `${total.toLocaleString('en-US')} ${total === 1 ? 'person' : 'people'}`
      : `${total.toLocaleString('en-US')} people. The first ${shown.toLocaleString('en-US')} are shown; type a name to find anyone.`

// Which accounts the popup starts on: the owner's last choice in this tab ('ALL' when it was every account), else the accounts the
// Unibox shows, else the account of the open conversation; undefined means every account.
export const startingAccounts = ({
   last,
   picked,
   open,
}: {
   last: ReadonlySet<string> | 'ALL' | undefined
   picked: ReadonlySet<string> | undefined
   open?: string
}): ReadonlySet<string> | undefined => {
   if (last) {
      return last === 'ALL' ? undefined : last
   }

   return picked ?? (open ? new Set([open]) : undefined)
}

// What a Connections page link does once brain answered: open the person's chat, or say why not and search their name in New message.
export const directOutcome = (
   found: Recipient | null | 'failed',
   to: string,
   accountName: string
): { open: Recipient } | { message: string; search: string } => {
   if (found === 'failed') {
      return {
         message: 'The connection could not be opened. Try again in a moment.',
         search: to,
      }
   }

   if (!found) {
      return {
         message: `This person is not a connection of ${accountName} any more, or its connections were not read yet.`,
         search: to,
      }
   }

   return found.blocked
      ? {
           message: `${found.name} is on your do-not-contact list.`,
           search: found.name,
        }
      : { open: found }
}

const NOT_ACTIVE: Record<Exclude<AccountState, 'ACTIVE'>, string> = {
   PAUSED: 'This account is paused, so nothing can be sent from it.',
   DISCONNECTED: 'This account is disconnected, so nothing can be sent from it.',
   RESTRICTED: 'LinkedIn restricted this account, so nothing can be sent from it.',
}

// Why nothing can be sent from the account, or undefined when it can.
export const notActiveReason = (account: Pick<UniboxAccount, 'state'> | undefined) =>
   !account ? 'The account is not known.' : account.state === 'ACTIVE' ? undefined : NOT_ACTIVE[account.state]

// Why this person cannot be written to, or undefined when they can.
export const recipientBlock = ({ blocked }: Recipient) =>
   blocked === 'DO_NOT_CONTACT' ? 'On your do-not-contact list.' : undefined

const EMPTY: Record<RecipientStatus, string> = {
   NEEDS_REPLY: 'No one is waiting for your reply on these accounts.',
   WAITING: 'No one you wrote to is still to answer on these accounts.',
   TALKED: 'No one you talked with before matches on these accounts.',
   NEVER: 'Everyone here has been messaged already.',
}

// What the list says when no one matches.
export const noRecipients = ({ query, accountIds, status }: RecipientSearch) => {
   if (query.trim()) {
      return 'No connection matches. Only people connected to one of your accounts are listed.'
   }

   if (status) {
      return EMPTY[status]
   }

   return accountIds
      ? 'No connection of these accounts matches.'
      : 'No connections to show. Read the connections of an account first.'
}
