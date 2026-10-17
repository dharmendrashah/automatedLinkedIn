import { describe, expect, it } from 'vitest'

import { clockText, describeSchedule } from './schedule-text'

describe('describeSchedule', () => {
   it('should say every kind of schedule in plain words', () => {
      const zone = { timeZone: 'Asia/Kolkata' }

      expect(describeSchedule(zone)).toBe('Every day at 9:00 AM, Kolkata time')
      expect(
         describeSchedule({
            ...zone,
            every: 'week',
            days: ['1', '4'],
            at: '18:30',
         })
      ).toBe('Every Monday and Thursday at 6:30 PM, Kolkata time')
      expect(
         describeSchedule({
            ...zone,
            every: 'week',
            weekday: 3,
         })
      ).toBe('Every Wednesday at 9:00 AM, Kolkata time')
      expect(
         describeSchedule({
            ...zone,
            every: 'month',
            dayOfMonth: 22,
         })
      ).toBe('On the 22nd of every month at 9:00 AM, Kolkata time')
      expect(
         describeSchedule({
            timeZone: 'America/New_York',
            every: 'hours',
            hours: 4,
            between: true,
            weekdaysOnly: true,
         })
      ).toBe('Every 4 hours, between 9:00 AM and 6:00 PM, Monday to Friday, New York time')
   })

   it('should read midnight and noon the usual way', () => {
      expect(clockText('00:05')).toBe('12:05 AM')
      expect(clockText('12:00')).toBe('12:00 PM')
   })
})
