import {
   type Recipient,
   type RecipientPage,
   type RecipientSearch,
   type RecipientStatus,
   type UniboxConversation,
} from '../types'

import { fold, tokensOf } from '../search'
import { lastMessage, statusOf } from '../status'

const SHOWN = 50

type Invented = Omit<Recipient, 'accountId' | 'status'>

// Invented connections that have no conversation yet; the last one is on the do-not-contact list.
const EXTRA: Invented[] = [
   { slug: 'grace-hopper-demo', name: 'Grace Hopper', headline: 'Rear Admiral at the Navy' },
   { slug: 'alan-turing-demo', name: 'Alan Turing', headline: 'Mathematician at Bletchley Park' },
   { slug: 'katherine-johnson-demo', name: 'Katherine Johnson', headline: 'Research Mathematician at NASA' },
   { slug: 'linus-demo', name: 'Linus Berg', headline: 'Engineering Manager at Globex' },
   { slug: 'maria-santos-demo', name: 'Maria Santos', headline: 'Head of Partnerships at Northwind' },
   { slug: 'oleg-ivanov-demo', name: 'Oleg Ivanov', headline: 'Founder at Beta Growth' },
   { slug: 'noor-demo', name: 'Noor Haddad', headline: 'Sales Director at Acme Sales' },
   {
      slug: 'blocked-demo',
      name: 'Dana Blocked',
      headline: 'Recruiter at Initech',
      blocked: 'DO_NOT_CONTACT',
   },
]

const slugOf = (conversation: UniboxConversation) => {
   const fromLink = /\/in\/([^/?#]+)/.exec(conversation.contact.profileUrl ?? '')?.[1]

   return fromLink ?? fold(conversation.contact.name).replace(/\W+/g, '-')
}

export const startedKey = (accountId: string, slug: string) => `${accountId}:${slug}`

const standingOf = (conversation: UniboxConversation): RecipientStatus => {
   const status = statusOf(conversation)

   return status === 'NEEDS_REPLY' ? 'NEEDS_REPLY' : status === 'REPLIED' ? 'WAITING' : 'TALKED'
}

// The connections of the sample accounts: the people each talks to (with their conversation) and the invented ones, spread over the
// accounts. `started` holds the conversations begun from the page (by `startedKey`), so those people are no longer new.
export const sampleRecipients = (
   accountIds: string[],
   conversations: UniboxConversation[],
   started: ReadonlyMap<string, string>,
   { query, accountIds: only, status }: RecipientSearch
): RecipientPage => {
   const known = new Map<string, Recipient>()

   // The invented ones first, so the cut below never hides them behind hundreds of sample conversations.
   EXTRA.forEach((person, index) => {
      const accountId = accountIds[index % accountIds.length]

      if (accountId) {
         const key = startedKey(accountId, person.slug)
         const conversationId = started.get(key)

         known.set(key, {
            ...person,
            accountId,
            status: conversationId ? 'WAITING' : 'NEVER',
            ...(conversationId && { conversationId }),
         })
      }
   })

   for (const conversation of conversations) {
      if (accountIds.includes(conversation.accountId) && conversation.kind === 'DIRECT') {
         const slug = slugOf(conversation)
         const last = lastMessage(conversation)

         known.set(startedKey(conversation.accountId, slug), {
            accountId: conversation.accountId,
            slug,
            name: conversation.contact.name,
            headline: '',
            conversationId: conversation.id,
            status: standingOf(conversation),
            ...(last && { last: { at: last.at, text: last.text, mine: last.direction === 'ME' } }),
            ...(conversation.contact.imageUrl && { imageUrl: conversation.contact.imageUrl }),
         })
      }
   }

   const tokens = tokensOf(query)
   const found = [...known.values()].filter(person => {
      const text = fold(`${person.name} ${person.headline} ${person.slug}`)

      return (
         tokens.every(token => text.includes(token)) &&
         (!only || only.includes(person.accountId)) &&
         (!status || person.status === status)
      )
   })

   return {
      people: found.slice(0, SHOWN),
      total: found.length,
   }
}
