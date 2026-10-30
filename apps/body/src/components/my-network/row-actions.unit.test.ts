import { describe, expect, it } from 'vitest'

import { type ActionRow, messageAction } from './row-actions'

// Dates reach the page as ISO text.
const at = (day: string) => `${day}T10:00:00.000Z`

const row = (rest: Partial<ActionRow>): ActionRow => ({
   slug: 'ada-l',
   doNotContact: false,
   connectedAt: null,
   inviteState: 'NONE',
   links: [],
   ...rest,
})

const conversation = (id: string, accountId: string, day: string) => ({
   kind: 'CONVERSATION' as const,
   accountId,
   sourceId: id,
   at: at(day),
})

const connection = (accountId: string, day: string) => ({
   kind: 'CONNECTION' as const,
   accountId,
   sourceId: `con-${accountId}`,
   at: at(day),
})

describe('messageAction', () => {
   it('opens the newest conversation of any account', () => {
      expect(
         messageAction(
            row({
               connectedAt: at('2026-01-01'),
               links: [conversation('c-old', 'a1', '2026-09-01'), conversation('c-new', 'a2', '2026-10-01')],
            }),
            true
         )
      ).toEqual({
         kind: 'OPEN_CHAT',
         href: '/unibox/c-new',
      })
   })

   it('starts a message from the account of the newest connection when there is no conversation', () => {
      expect(
         messageAction(
            row({
               connectedAt: at('2026-01-01'),
               links: [connection('a1', '2026-01-01'), connection('a 2', '2026-05-01')],
            }),
            true
         )
      ).toEqual({
         kind: 'START_CHAT',
         href: '/unibox/new?account=a+2&to=ada-l',
      })
   })

   it('offers an invite to someone not connected, only when an invite can go', () => {
      expect(messageAction(row({}), true)).toEqual({ kind: 'INVITE' })
      expect(messageAction(row({ inviteState: 'ENDED' }), true)).toEqual({ kind: 'INVITE' })
      expect(messageAction(row({}), false)).toEqual({
         kind: 'NONE',
         reason: 'Invites are not on yet',
      })
      expect(messageAction(row({ inviteState: 'PENDING' }), true)).toEqual({
         kind: 'NONE',
         reason: 'Invite already sent',
      })
      expect(messageAction(row({ inviteState: 'QUEUED' }), true)).toEqual({
         kind: 'NONE',
         reason: 'Invite already queued',
      })
   })

   it('never starts a message to someone on Do not contact, but still opens a conversation they have', () => {
      expect(messageAction(row({ doNotContact: true }), true)).toEqual({
         kind: 'NONE',
         reason: 'On Do not contact',
      })
      expect(
         messageAction(
            row({
               doNotContact: true,
               connectedAt: at('2026-01-01'),
               links: [connection('a1', '2026-01-01')],
            }),
            true
         )
      ).toEqual({
         kind: 'NONE',
         reason: 'On Do not contact',
      })
      expect(
         messageAction(
            row({
               doNotContact: true,
               links: [conversation('c1', 'a1', '2026-10-01')],
            }),
            true
         )
      ).toEqual({
         kind: 'OPEN_CHAT',
         href: '/unibox/c1',
      })
   })

   it('says so when connected but no account can be named', () => {
      expect(messageAction(row({ connectedAt: at('2026-01-01') }), true)).toEqual({
         kind: 'NONE',
         reason: 'No account to write from',
      })
   })
})
