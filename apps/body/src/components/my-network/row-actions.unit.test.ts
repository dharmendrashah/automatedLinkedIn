import { describe, expect, it } from 'vitest'

import { type ActionRow, inviteBlock, messageAction } from './row-actions'

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
            })
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
            })
         )
      ).toEqual({
         kind: 'START_CHAT',
         href: '/unibox/new?account=a+2&to=ada-l',
      })
   })

   it('offers no message to someone not connected and with no conversation', () => {
      expect(messageAction(row({ inviteState: 'PENDING' }))).toEqual({
         kind: 'NONE',
         reason: 'Not connected yet',
      })
   })

   it('never starts a message to someone on Do not contact, but still opens a conversation they have', () => {
      expect(messageAction(row({ doNotContact: true }))).toEqual({
         kind: 'NONE',
         reason: 'On Do not contact',
      })
      expect(
         messageAction(
            row({
               doNotContact: true,
               connectedAt: at('2026-01-01'),
               links: [connection('a1', '2026-01-01')],
            })
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
            })
         )
      ).toEqual({
         kind: 'OPEN_CHAT',
         href: '/unibox/c1',
      })
   })

   it('says so when connected but no account can be named', () => {
      expect(messageAction(row({ connectedAt: at('2026-01-01') }))).toEqual({
         kind: 'NONE',
         reason: 'No account to write from',
      })
   })
})

describe('inviteBlock', () => {
   it('lets an invite go to someone not connected, and an ended invite go again', () => {
      expect(inviteBlock(row({}), true)).toBeNull()
      expect(inviteBlock(row({ inviteState: 'ENDED' }), true)).toBeNull()
   })

   it('says why no invite can go', () => {
      expect(inviteBlock(row({}), false)).toBe('Invites are not on yet')
      expect(inviteBlock(row({ doNotContact: true }), true)).toBe('On Do not contact')
      expect(inviteBlock(row({ connectedAt: at('2026-01-01') }), true)).toBe('Already connected')
      expect(inviteBlock(row({ inviteState: 'PENDING' }), true)).toBe('Invite already sent')
      expect(inviteBlock(row({ inviteState: 'QUEUED' }), true)).toBe('Invite already queued')
   })
})
