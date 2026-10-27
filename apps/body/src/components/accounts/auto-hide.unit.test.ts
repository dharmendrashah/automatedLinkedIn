import { describe, expect, it } from 'vitest'

import { SHOW_MAX_MS, SHOW_MS, expired, extendedDeadline, secondsLeft } from './auto-hide'

describe('auto-hide', () => {
   const shownAt = 1_000_000

   it('should count the seconds left and say when the time is up', () => {
      expect(secondsLeft(shownAt + SHOW_MS, shownAt)).toBe(30)
      expect(secondsLeft(shownAt + SHOW_MS, shownAt + 29_100)).toBe(1)
      expect(secondsLeft(shownAt + SHOW_MS, shownAt + 31_000)).toBe(0)
      expect(expired(shownAt + SHOW_MS, shownAt + SHOW_MS - 1)).toBe(false)
      expect(expired(shownAt + SHOW_MS, shownAt + SHOW_MS)).toBe(true)
   })

   it('should add 30 seconds each time but stop at 2 minutes from the first showing', () => {
      let deadline = shownAt + SHOW_MS

      deadline = extendedDeadline(deadline, shownAt)
      expect(deadline).toBe(shownAt + 60_000)

      deadline = extendedDeadline(extendedDeadline(deadline, shownAt), shownAt)
      expect(deadline).toBe(shownAt + SHOW_MAX_MS)
      expect(extendedDeadline(deadline, shownAt)).toBe(shownAt + SHOW_MAX_MS)
   })
})
