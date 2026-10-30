import { describe, expect, it } from 'vitest'

import { countText, keyAction, nextAfter, nextStepOf, stepFrom, toggleChosen } from './rows'

describe('countText', () => {
   it('shows 10k+ above the cap', () => {
      expect(countText(10_001, 10_000)).toBe('10k+')
      expect(countText(10_000, 10_000)).toBe('10,000')
   })
})

describe('nextStepOf', () => {
   const request = {
      kind: 'REQUEST',
      accountId: 'a1',
      sourceId: 'r1',
   }

   it('is Reply for a waiting reply, Accept for a waiting request, Invite once invites are live, and nothing otherwise', () => {
      const live = { invitesLive: true }

      expect(nextStepOf({ priority: 3, links: [request], ...live })).toEqual({ kind: 'REPLY' })
      expect(nextStepOf({ priority: 2, links: [request], ...live })).toEqual({
         kind: 'ACCEPT',
         accountId: 'a1',
         requestId: 'r1',
      })
      expect(nextStepOf({ priority: 2, links: [], ...live })).toBeNull()
      expect(nextStepOf({ priority: 1, links: [], ...live })).toEqual({ kind: 'INVITE' })
      expect(nextStepOf({ priority: 1, links: [], invitesLive: false })).toBeNull()
      expect(nextStepOf({ priority: 0, links: [request], ...live })).toBeNull()
   })
})

describe('row selection', () => {
   const ids = ['a', 'b', 'c']

   it('moves within the ends and starts at the top', () => {
      expect(stepFrom(ids, null, 1)).toBe('a')
      expect(stepFrom(ids, 'c', 1)).toBe('c')
      expect(stepFrom(ids, 'b', -1)).toBe('a')
   })

   it('selects the row below after an action, or above at the end', () => {
      expect(nextAfter(ids, 'a')).toBe('b')
      expect(nextAfter(ids, 'c')).toBe('b')
      expect(nextAfter(['a'], 'a')).toBeNull()
   })

   it('chooses at most 100 rows', () => {
      const full = Array.from({ length: 100 }, (_, index) => `${index}`)

      expect(toggleChosen(full, 'x')).toBe(full)
      expect(toggleChosen(['x'], 'x')).toEqual([])
   })

   it('ignores keys while typing or with a modifier', () => {
      expect(keyAction({ key: 'j', typing: false, modified: false })).toBe('next')
      expect(keyAction({ key: 'Enter', typing: true, modified: false })).toBeNull()
      expect(keyAction({ key: 'k', typing: false, modified: true })).toBeNull()
   })
})
