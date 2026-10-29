import { describe, expect, it } from 'vitest'

import { firstReadsDone, firstReadsOf, firstReadsText } from './firstReads'

const none = {
   status: 'ACTIVE' as const,
   profileAskedAt: null,
   invitationsReadAt: null,
   connectionsReadAt: null,
   messagesBackfilledAt: null,
}

describe('firstReadsOf', () => {
   it('should list the four first reads in the order they run, each done or still to come', () => {
      expect(firstReadsOf({ ...none, profileAskedAt: '2026-10-30T09:00:00Z' })).toEqual([
         { label: 'Own profile', done: true },
         { label: 'Connection requests', done: false },
         { label: 'Connections', done: false },
         { label: 'Messages, the whole inbox', done: false },
      ])
   })
})

describe('firstReadsText and firstReadsDone', () => {
   it('should count what is done, and say when all of it is', () => {
      expect(firstReadsText(none)).toBe('0 of 4 done')
      expect(firstReadsDone(none)).toBe(false)

      const all = {
         ...none,
         profileAskedAt: 'x',
         invitationsReadAt: 'x',
         connectionsReadAt: 'x',
         messagesBackfilledAt: 'x',
      }

      expect(firstReadsText(all)).toBe('4 of 4 done')
      expect(firstReadsDone(all)).toBe(true)
   })
})
