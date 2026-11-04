import { describe, expect, it } from 'vitest'

import { postTooOld, reactionFor, waitAfterAct } from './engageRules'

const DAY_MS = 24 * 60 * 60 * 1000

describe('waitAfterAct', () => {
   it('should add a stable extra of under a day to the days apart', () => {
      const wait = waitAfterAct('ada', 2)

      expect(wait).toBe(waitAfterAct('ada', 2))
      expect(wait).toBeGreaterThanOrEqual(2 * DAY_MS)
      expect(wait).toBeLessThan(3 * DAY_MS)
      expect(waitAfterAct('ada', 0)).toBeLessThan(DAY_MS)
   })

   it('should differ from person to person', () => {
      const extras = new Set(Array.from({ length: 30 }, (_u, index) => waitAfterAct(`p${index}`, 1)))

      expect(extras.size).toBeGreaterThan(20)
   })
})

describe('reactionFor', () => {
   it('should pick the same reaction for a post every time, from the ones ticked', () => {
      const ticked = ['like', 'insightful'] as const

      expect(reactionFor('activity:1', [...ticked])).toBe(reactionFor('activity:1', [...ticked]))

      const picks = new Set(Array.from({ length: 40 }, (_u, index) => reactionFor(`activity:${index}`, [...ticked])))

      expect(picks).toEqual(new Set(ticked))
      expect(reactionFor('activity:1', ['love'])).toBe('love')
   })
})

describe('postTooOld', () => {
   it('should leave a post older than a week, and never a post with no known date', () => {
      const now = new Date('2026-11-04T10:00:00.000Z')

      expect(postTooOld(new Date('2026-10-27T10:00:00.000Z'), now)).toBe(true)
      expect(postTooOld(new Date('2026-10-30T10:00:00.000Z'), now)).toBe(false)
      expect(postTooOld(null, now)).toBe(false)
   })
})
