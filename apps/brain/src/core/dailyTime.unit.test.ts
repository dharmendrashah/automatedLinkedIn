import { describe, expect, it } from 'vitest'

import { dailyTime, nextMessagesTime, timezoneOfCountry } from './dailyTime'

// 15:30 in India.
const NOW = new Date('2026-10-19T10:00:00Z')

describe('dailyTime', () => {
   it('should pick a time on the next day between 08:00 and 22:00 where the account is', () => {
      expect(dailyTime(NOW, 'Asia/Kolkata', { today: false }, () => 0)).toEqual(new Date('2026-10-20T02:30:00Z'))
      expect(dailyTime(NOW, 'Asia/Kolkata', { today: false }, () => 0.999999)).toEqual(new Date('2026-10-20T16:29:00Z'))
   })

   it('should pick a later time today while the day is still open', () => {
      expect(dailyTime(NOW, 'Asia/Kolkata', { today: true }, () => 0)).toEqual(new Date('2026-10-19T10:01:00Z'))
   })

   it('should move to the next day once the day is over', () => {
      const late = new Date('2026-10-19T17:00:00Z')

      expect(dailyTime(late, 'Asia/Kolkata', { today: true }, () => 0)).toEqual(new Date('2026-10-20T02:30:00Z'))
   })

   it('should not start before 08:00 on a day that has not begun yet', () => {
      const early = new Date('2026-10-19T00:30:00Z')

      expect(dailyTime(early, 'Asia/Kolkata', { today: true }, () => 0)).toEqual(new Date('2026-10-19T02:30:00Z'))
   })

   it('should follow the clock change of the day', () => {
      const beforeChange = new Date('2026-10-31T12:00:00Z')

      expect(dailyTime(beforeChange, 'America/New_York', { today: false }, () => 0)).toEqual(
         new Date('2026-11-01T13:00:00Z')
      )
   })
})

describe('timezoneOfCountry', () => {
   it('should answer the main timezone of a country, and UTC when it is not known', () => {
      expect(timezoneOfCountry('IN')).toBe('Asia/Kolkata')
      expect(timezoneOfCountry('de')).toBe('Europe/Berlin')
      expect(timezoneOfCountry('ZZ')).toBe('UTC')
      expect(timezoneOfCountry(null)).toBe('UTC')
   })
})

describe('nextMessagesTime', () => {
   // India is UTC+05:30.
   it.each([
      ['by day, 30 minutes on', '2026-10-19T10:00:00Z', '2026-10-19T10:30:00Z'],
      ['at 21:59, still 30 minutes on', '2026-10-19T16:29:00Z', '2026-10-19T16:59:00Z'],
      ['at 22:00, 2 hours on', '2026-10-19T16:30:00Z', '2026-10-19T18:30:00Z'],
      ['at 07:00, not past 08:00', '2026-10-20T01:30:00Z', '2026-10-20T02:30:00Z'],
      ['at 08:00, 30 minutes on', '2026-10-20T02:30:00Z', '2026-10-20T03:00:00Z'],
   ])('should read %s', (_, now, next) => {
      expect(nextMessagesTime(new Date(now), 'Asia/Kolkata')).toEqual(new Date(next))
   })
})
