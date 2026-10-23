import { describe, expect, it } from 'vitest'

import { parseClock, parseDay } from './when'

// Thursday, 22 October 2026.
const today = new Date(Date.UTC(2026, 9, 22, 12, 0, 0))

describe('parseDay', () => {
   it.each([
      ['Jan 25, 2024', '2024-01-25'],
      ['  Dec 1, 2025 ', '2025-12-01'],
      ['Today', '2026-10-22'],
      ['Yesterday', '2026-10-21'],
      ['Jan 16', '2026-01-16'],
      ['Oct 22', '2026-10-22'],
      ['Mon', '2026-10-19'],
      ['Thursday', '2026-10-15'],
      ['Sunday', '2026-10-18'],
   ])('should read %s as %s', (text, day) => {
      expect(parseDay(text, today)).toBe(day)
   })

   it('should take a day without a year that has not come yet this year as last year', () => {
      expect(parseDay('Dec 30', today)).toBe('2025-12-30')
   })

   it('should leave out what it does not understand, and a date that does not exist', () => {
      expect(parseDay('25. Januar 2024', today)).toBeUndefined()
      expect(parseDay('Feb 30, 2024', today)).toBeUndefined()
      expect(parseDay('', today)).toBeUndefined()
   })
})

describe('parseClock', () => {
   it.each([
      ['5:18 PM', '17:18'],
      ['12:05 AM', '00:05'],
      ['12:30 PM', '12:30'],
      ['9:07 am', '09:07'],
      ['17:18', '17:18'],
   ])('should read %s as %s', (text, clock) => {
      expect(parseClock(text)).toBe(clock)
   })

   it('should leave out what is not a time', () => {
      expect(parseClock('later')).toBeUndefined()
      expect(parseClock('25:61')).toBeUndefined()
   })
})
