import { describe, expect, it } from 'vitest'

import { ageOf, agoOf, dayLabel, formatClock, formatFull, formatListTime, sameDay } from './time'

// Friday, 23 October 2026, 15:00 in the machine's own time zone, which is how every time is shown.
const now = new Date(2026, 9, 23, 15, 0).getTime()
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
   new Date(year, month - 1, day, hour, minute).getTime()

describe('formatListTime', () => {
   it('should give the time of day for today, and Yesterday', () => {
      expect(formatListTime(at(2026, 10, 23, 9, 5), now)).toBe('9:05 AM')
      expect(formatListTime(at(2026, 10, 22, 23, 0), now)).toBe('Yesterday')
   })

   it('should give the weekday within the last week, the date within the year, and the year before', () => {
      expect(formatListTime(at(2026, 10, 20), now)).toBe('Tue')
      expect(formatListTime(at(2026, 10, 1), now)).toBe('Oct 1')
      expect(formatListTime(at(2025, 7, 9), now)).toBe('Jul 9, 2025')
   })
})

describe('formatFull', () => {
   it('should give the full date and time', () => {
      expect(formatFull(at(2026, 10, 23, 17, 18))).toBe('Oct 23, 2026, 5:18 PM')
   })
})

describe('dayLabel', () => {
   it('should name today and yesterday, the weekday of the last week, and the date otherwise', () => {
      expect(dayLabel(at(2026, 10, 23), now)).toBe('Today')
      expect(dayLabel(at(2026, 10, 22), now)).toBe('Yesterday')
      expect(dayLabel(at(2026, 10, 19), now)).toBe('Monday, Oct 19')
      expect(dayLabel(at(2026, 3, 2), now)).toBe('Mar 2')
      expect(dayLabel(at(2024, 1, 25), now)).toBe('Jan 25, 2024')
   })
})

describe('ageOf', () => {
   it('should say how long it has been, in the largest unit', () => {
      expect(ageOf(now - 20_000, now)).toBe('just now')
      expect(ageOf(now - 12 * 60_000, now)).toBe('12m')
      expect(ageOf(now - 5 * 3_600_000, now)).toBe('5h')
      expect(ageOf(now - 3 * 86_400_000, now)).toBe('3d')
      expect(ageOf(now - 70 * 86_400_000, now)).toBe('10w')
   })

   it('should not go negative for a time in the future', () => {
      expect(ageOf(now + 5 * 60_000, now)).toBe('just now')
   })
})

describe('agoOf', () => {
   it('should add "ago" to an age, but not to "just now"', () => {
      expect(agoOf(now - 12 * 60_000, now)).toBe('12m ago')
      expect(agoOf(now - 5_000, now)).toBe('just now')
   })
})

describe('formatClock', () => {
   it('should show seconds as minutes and seconds', () => {
      expect(formatClock(5)).toBe('0:05')
      expect(formatClock(72)).toBe('1:12')
   })
})

describe('sameDay', () => {
   it('should compare calendar days, not 24 hours', () => {
      expect(sameDay(at(2026, 10, 23, 0, 1), at(2026, 10, 23, 23, 59))).toBe(true)
      expect(sameDay(at(2026, 10, 22, 23, 59), at(2026, 10, 23, 0, 1))).toBe(false)
   })
})
