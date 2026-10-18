import { describe, expect, it } from 'vitest'

import { addedSince } from './added'

describe('addedSince', () => {
   // Wednesday afternoon, local time.
   const now = new Date(2026, 9, 14, 15, 30)

   it('should start at local midnight today, on Monday this week, or 30 days back', () => {
      expect(addedSince('any', now)).toBeUndefined()
      expect(addedSince('today', now)).toBe(new Date(2026, 9, 14).toISOString())
      expect(addedSince('week', now)).toBe(new Date(2026, 9, 12).toISOString())
      expect(addedSince('30d', now)).toBe(new Date(2026, 8, 14).toISOString())
   })
})
