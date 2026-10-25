import { describe, expect, it } from 'vitest'

import {
   type AllowanceInput,
   allowance,
   bitsToDays,
   dayKey,
   daysToBits,
   hoursProblem,
   lastDayKeys,
   nextOfficeStart,
   weekdayOfKey,
   whenText,
} from './browseAllowance'

const OFFICE = {
   timeZone: 'UTC',
   days: 0b11111,
   startMinute: 9 * 60,
   endMinute: 18 * 60,
}

const CAP = 90 * 60

const at = (iso: string) => new Date(iso)

const ask = (patch: Partial<AllowanceInput> = {}) =>
   allowance({
      now: at('2026-10-21T12:00:00Z'),
      office: OFFICE,
      capSeconds: CAP,
      usedSeconds: 0,
      backgroundSeconds: 0,
      klass: 'ACTION',
      estimateSeconds: 300,
      lastEndedAt: null,
      inFlight: false,
      ...patch,
   })

describe('allowance', () => {
   it('should allow a session in office hours when the day has time and the line has room', () => {
      expect(ask()).toEqual({ ok: true })
   })

   it('should hold a session outside the office until the next office start, over a night and a weekend', () => {
      expect(ask({ now: at('2026-10-21T07:00:00Z') })).toEqual({
         ok: false,
         reason: 'OUTSIDE_OFFICE',
         until: at('2026-10-21T09:00:00Z'),
      })
      expect(ask({ now: at('2026-10-21T19:00:00Z') })).toMatchObject({ until: at('2026-10-22T09:00:00Z') })
      expect(ask({ now: at('2026-10-23T19:00:00Z') })).toMatchObject({ until: at('2026-10-26T09:00:00Z') })
      expect(ask({ now: at('2026-10-24T12:00:00Z') })).toMatchObject({
         reason: 'OUTSIDE_OFFICE',
         until: at('2026-10-26T09:00:00Z'),
      })
   })

   it('should release the day evenly: only a burst at the start, the line grows with the office window', () => {
      const start = { now: at('2026-10-21T09:00:00Z') }

      expect(ask(start)).toEqual({ ok: true })
      expect(
         ask({
            ...start,
            usedSeconds: 600,
         })
      ).toEqual({
         ok: false,
         reason: 'TOO_SOON',
         until: at('2026-10-21T09:30:00Z'),
      })
      expect(
         ask({
            now: at('2026-10-21T09:30:00Z'),
            usedSeconds: 600,
         })
      ).toEqual({ ok: true })
   })

   it('should stop a day that is full and wait for the next office start', () => {
      expect(
         ask({
            now: at('2026-10-21T17:59:00Z'),
            usedSeconds: CAP,
         })
      ).toEqual({
         ok: false,
         reason: 'DAY_FULL',
         until: at('2026-10-22T09:00:00Z'),
      })
   })

   it('should let a session start while time is left even if its estimate goes over, since overshoot is allowed', () => {
      expect(
         ask({
            now: at('2026-10-21T17:59:00Z'),
            usedSeconds: CAP - 60,
         })
      ).toEqual({ ok: true })
   })

   it('should keep background reads to 40 percent of the cap', () => {
      expect(
         ask({
            klass: 'BACKGROUND',
            backgroundSeconds: 1900,
         })
      ).toMatchObject({
         ok: false,
         reason: 'BACKGROUND_FULL',
      })
      expect(
         ask({
            klass: 'BACKGROUND',
            backgroundSeconds: 1800,
         })
      ).toEqual({ ok: true })
      expect(
         ask({
            klass: 'ACTION',
            backgroundSeconds: 1900,
         })
      ).toEqual({ ok: true })
   })

   it('should never run two sessions back to back, whatever the task', () => {
      const now = at('2026-10-21T12:00:00Z')

      expect(
         ask({
            now,
            inFlight: true,
         })
      ).toMatchObject({
         ok: false,
         reason: 'GAP',
      })
      expect(
         ask({
            now,
            lastEndedAt: at('2026-10-21T11:55:00Z'),
         })
      ).toEqual({
         ok: false,
         reason: 'GAP',
         until: at('2026-10-21T12:05:00Z'),
      })
      expect(
         ask({
            now,
            lastEndedAt: at('2026-10-21T11:49:00Z'),
         })
      ).toEqual({ ok: true })
   })

   it('should count a sign-in check and never refuse it', () => {
      expect(
         ask({
            klass: 'SYSTEM',
            now: at('2026-10-24T03:00:00Z'),
            usedSeconds: CAP * 2,
            inFlight: true,
         })
      ).toEqual({ ok: true })
   })

   it('should follow the zone of the account, daylight saving included', () => {
      const india = {
         ...OFFICE,
         timeZone: 'Asia/Kolkata',
      }
      const london = {
         ...OFFICE,
         timeZone: 'Europe/London',
      }

      expect(
         ask({
            office: india,
            now: at('2026-10-21T04:00:00Z'),
         })
      ).toEqual({ ok: true })
      expect(
         ask({
            office: india,
            now: at('2026-10-21T13:00:00Z'),
         })
      ).toMatchObject({
         reason: 'OUTSIDE_OFFICE',
         until: at('2026-10-22T03:30:00Z'),
      })
      expect(
         ask({
            office: london,
            now: at('2026-10-23T18:30:00Z'),
         })
      ).toMatchObject({ until: at('2026-10-26T09:00:00Z') })
   })

   it('should treat a zone it does not know as UTC', () => {
      expect(
         ask({
            office: {
               ...OFFICE,
               timeZone: 'Not/AZone',
            },
            now: at('2026-10-21T07:00:00Z'),
         })
      ).toMatchObject({ until: at('2026-10-21T09:00:00Z') })
   })
})

describe('dayKey and nextOfficeStart', () => {
   it('should name the day in the account zone, not in UTC', () => {
      expect(dayKey(at('2026-10-21T22:30:00Z'), 'Asia/Kolkata')).toBe('2026-10-22')
      expect(dayKey(at('2026-10-21T22:30:00Z'), 'UTC')).toBe('2026-10-21')
   })

   it('should find the first working day with an office that is open, here only on Saturdays', () => {
      expect(
         nextOfficeStart(at('2026-10-21T12:00:00Z'), {
            ...OFFICE,
            days: 0b0100000,
         })
      ).toEqual(at('2026-10-24T09:00:00Z'))
   })
})

describe('whenText', () => {
   const now = at('2026-10-21T12:00:00Z')

   it('should say the time of a moment today, tomorrow or later, in the account zone', () => {
      expect(whenText(at('2026-10-21T14:20:00Z'), now, 'UTC')).toBe('at 14:20')
      expect(whenText(at('2026-10-22T09:00:00Z'), now, 'UTC')).toBe('tomorrow at 09:00')
      expect(whenText(at('2026-10-26T09:00:00Z'), now, 'UTC')).toBe('on Mon 26 Oct at 09:00')
      expect(whenText(at('2026-10-21T14:20:00Z'), now, 'Asia/Kolkata')).toBe('at 19:50')
   })
})

describe('days and hours', () => {
   it('should list the last days oldest first and know their weekday', () => {
      expect(lastDayKeys('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
      expect(weekdayOfKey('2026-10-21')).toBe(3)
      expect(weekdayOfKey('2026-10-25')).toBe(7)
   })

   it('should turn weekdays into bits and back', () => {
      expect(daysToBits([1, 2, 3, 4, 5])).toBe(31)
      expect(bitsToDays(0b1100001)).toEqual([1, 6, 7])
   })

   it('should only accept hours that hold the minutes of the mode', () => {
      expect(hoursProblem('SAFE', OFFICE)).toBeUndefined()
      expect(
         hoursProblem('AGGRESSIVE', {
            ...OFFICE,
            startMinute: 8 * 60,
            endMinute: 11 * 60,
         })
      ).toBeUndefined()
      expect(
         hoursProblem('SAFE', {
            ...OFFICE,
            days: 0,
         })
      ).toBe('Pick at least one working day.')
      expect(
         hoursProblem('SAFE', {
            ...OFFICE,
            endMinute: OFFICE.startMinute,
         })
      ).toBe('Working hours must end after they start.')
      expect(
         hoursProblem('SAFE', {
            ...OFFICE,
            endMinute: OFFICE.startMinute + 60,
         })
      ).toBe('Safe needs at least 1 h 30 min of working time.')
   })
})
