import { describe, expect, it } from 'vitest'

import { connectedLine, messageAction, readLine, removeBlocker, stateOf } from './describe'

const NOW = Date.parse('2026-10-28T12:00:00Z')

const account = {
   accountId: 'a1',
   total: 115,
   readAt: '2026-10-28T11:48:00.000Z',
   reading: false,
   removedToday: 2,
   removeLeft: 8,
}

describe('readLine', () => {
   it('should say how many connections the account has and when they were read', () => {
      expect(readLine(account, NOW)).toBe('115 connections. Last read 12 minutes ago.')
      expect(readLine({ ...account, total: 1 }, NOW)).toBe('1 connection. Last read 12 minutes ago.')
   })

   it('should say they were never read, and that a read is going on', () => {
      expect(readLine({ ...account, readAt: null, total: 0 }, NOW)).toBe('Not read yet.')
      expect(readLine({ ...account, reading: true }, NOW)).toBe(
         'Reading the connections from LinkedIn. A long list takes several minutes, and this page updates by itself.'
      )
   })
})

describe('stateOf', () => {
   const base = { state: 'CONNECTED' as const }

   it('should say nothing of a connection that is simply connected', () => {
      expect(stateOf(base, NOW)).toBeUndefined()
   })

   it('should say a removal is on its way, since when, with LinkedIn’s own wait', () => {
      expect(stateOf({ state: 'REMOVING', startedAt: '2026-10-28T11:59:00.000Z' }, NOW)).toEqual({
         label: 'Removing',
         tone: 'busy',
         line: 'Waiting for LinkedIn. Started 1 minute ago.',
      })
   })

   it('should say what became of a removal in a sentence brain wrote, or a plain one', () => {
      expect(stateOf({ state: 'REMOVED', removedAt: '2026-10-28T10:00:00.000Z' }, NOW)).toEqual({
         label: 'Removed',
         tone: 'muted',
         line: 'Removed 2 hours ago.',
      })
      expect(stateOf({ state: 'GONE' }, NOW)).toEqual({
         label: 'No longer connected',
         tone: 'muted',
         line: 'LinkedIn no longer lists this person.',
      })
      expect(stateOf({ state: 'UNSURE', failure: 'LinkedIn did not show whether the removal took.' }, NOW)).toEqual({
         label: 'Not sure',
         tone: 'warn',
         line: 'LinkedIn did not show whether the removal took.',
      })
      expect(stateOf({ state: 'FAILED' }, NOW)).toEqual({
         label: 'Not removed',
         tone: 'bad',
         line: 'The removal could not be done.',
      })
   })
})

describe('removeBlocker', () => {
   it('should let a connection on the list be removed while the account has removals left', () => {
      expect(removeBlocker({ state: 'CONNECTED' }, account)).toBeUndefined()
   })

   it('should say why not: a removal going on, a read going on, the day used, the account signed out, or the person not on the list', () => {
      expect(removeBlocker({ state: 'REMOVING' }, account)).toBe('This connection is being removed.')
      expect(removeBlocker({ state: 'UNSURE' }, account)).toBe('Read the connections again to check this one first.')
      expect(removeBlocker({ state: 'GONE' }, account)).toBe('This person is not on the list any more.')
      expect(removeBlocker({ state: 'CONNECTED' }, { ...account, reading: true })).toBe(
         'A read of the connections is going on. Try again when it is done.'
      )
      expect(removeBlocker({ state: 'CONNECTED' }, { ...account, removeLeft: 0 })).toBe(
         'This account has used its removals for today.'
      )
      expect(removeBlocker({ state: 'CONNECTED' }, { ...account, problem: 'SIGNED_OUT' })).toBe(
         'LinkedIn asked this account to sign in.'
      )
   })
})

describe('messageAction', () => {
   it('should open the conversation in the Unibox when there is one', () => {
      expect(messageAction({ conversationId: '2-abc==', slug: 'ada-l' }, 'a1')).toBe('/unibox/2-abc%3D%3D')
   })

   it('should open New message for the person when there is no conversation yet', () => {
      expect(messageAction({ slug: 'ada-l' }, 'a 1')).toBe('/unibox/new?account=a+1&to=ada-l')
   })
})

describe('connectedLine', () => {
   it('should write the day they connected, in the viewer’s language, without shifting it by a time zone', () => {
      expect(connectedLine('2026-10-27', 'en-US')).toBe('Connected Oct 27, 2026')
      expect(connectedLine('2026-01-01', 'en-US')).toBe('Connected Jan 1, 2026')
      expect(connectedLine(undefined, 'en-US')).toBeUndefined()
   })
})
