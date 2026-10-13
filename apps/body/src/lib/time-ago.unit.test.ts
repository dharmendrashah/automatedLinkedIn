import { describe, expect, it } from 'vitest'

import { timeAgo } from './time-ago'

const NOW = new Date('2026-10-14T12:00:00Z')

describe('timeAgo', () => {
   it.each([
      ['2026-10-14T11:59:40Z', 'just now'],
      ['2026-10-14T11:59:00Z', '1 minute ago'],
      ['2026-10-14T11:15:00Z', '45 minutes ago'],
      ['2026-10-14T11:00:00Z', '1 hour ago'],
      ['2026-10-14T00:00:00Z', '12 hours ago'],
      ['2026-10-13T12:00:00Z', '1 day ago'],
      ['2026-10-11T12:00:00Z', '3 days ago'],
   ])('should say %s was %s', (value, expected) => {
      expect(timeAgo(value, NOW)).toBe(expected)
   })

   it('should say never when there is no date', () => {
      expect(timeAgo(null, NOW)).toBe('never')
   })
})
