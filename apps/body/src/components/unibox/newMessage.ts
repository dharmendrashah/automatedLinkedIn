import { type AccountState, type Recipient, type UniboxAccount, type UniboxConversation } from './types'

import { type Row } from './inbox'

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

// NEW: never talked to. WAITING: the last word was ours. TALKED: the last word was theirs and the owner closed it.
export type EntryState = 'NEEDS_REPLY' | 'WAITING' | 'TALKED' | 'NEW' | 'BLOCKED'

export type Entry = {
   person: Recipient
   state: EntryState
   last?: { at: number; text: string; mine: boolean }
}

const RANK: Record<EntryState, number> = {
   NEEDS_REPLY: 0,
   WAITING: 1,
   TALKED: 1,
   NEW: 2,
   BLOCKED: 3,
}

const entryOf = (person: Recipient, row: Row | undefined): Entry => {
   if (person.blocked) {
      return { person, state: 'BLOCKED' }
   }

   if (!row || row.lastAt === 0) {
      return { person, state: 'NEW' }
   }

   const last = {
      at: row.lastAt,
      text: row.preview.text,
      mine: row.preview.from === 'ME',
   }

   return {
      person,
      state: row.status === 'NEEDS_REPLY' ? 'NEEDS_REPLY' : last.mine ? 'WAITING' : 'TALKED',
      last,
   }
}

// The connections as New message lists them, with where each conversation stands: the ones to answer first, then the latest talked to,
// then the ones never written to by name, and the do-not-contact ones last.
export const connectionEntries = (people: Recipient[], byId: ReadonlyMap<string, Row>): Entry[] =>
   people
      .map(person => entryOf(person, person.conversationId ? byId.get(person.conversationId) : undefined))
      .sort(
         (a, b) =>
            RANK[a.state] - RANK[b.state] ||
            (b.last?.at ?? 0) - (a.last?.at ?? 0) ||
            a.person.name.localeCompare(b.person.name)
      )

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

// What the list says when no one matches.
export const noRecipients = (query: string) =>
   query.trim()
      ? 'No connection matches. Only people connected to one of your accounts are listed.'
      : 'No connections to show. Read the connections of an account first.'
