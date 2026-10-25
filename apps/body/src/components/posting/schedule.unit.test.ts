import { describe, expect, it } from 'vitest'

import {
   MIN_LEAD_MS,
   describePlanned,
   fromInputs,
   instantOf,
   plannedProblem,
   presets,
   toInputs,
   wallOf,
} from './schedule'

describe('wallOf and instantOf', () => {
   it('should read the clock of a zone and turn it back into the same instant', () => {
      const instant = new Date('2026-10-25T10:00:00.000Z')

      expect(wallOf(instant, 'Asia/Kolkata')).toEqual({
         year: 2026,
         month: 10,
         day: 25,
         hour: 15,
         minute: 30,
         weekday: 0,
      })
      expect(
         instantOf(
            {
               year: 2026,
               month: 10,
               day: 25,
               hour: 15,
               minute: 30,
            },
            'Asia/Kolkata'
         )
      ).toEqual(instant)
   })

   it('should refuse a time that does not exist because the clocks jump forward', () => {
      const gap = {
         year: 2026,
         month: 3,
         day: 8,
         hour: 2,
         minute: 30,
      }

      expect(instantOf(gap, 'America/New_York')).toBeUndefined()
      expect(instantOf({ ...gap, hour: 3 }, 'America/New_York')).toEqual(new Date('2026-03-08T07:30:00.000Z'))
   })

   it('should take a time that happens twice and give one of them', () => {
      const wall = {
         year: 2026,
         month: 11,
         day: 1,
         hour: 1,
         minute: 30,
      }
      const instant = instantOf(wall, 'America/New_York')

      expect(instant).toBeDefined()
      expect(wallOf(instant as Date, 'America/New_York')).toMatchObject(wall)
   })
})

describe('inputs', () => {
   it('should fill the date and time boxes from an instant, in the zone', () => {
      expect(toInputs('2026-11-03T03:30:00.000Z', 'Asia/Kolkata')).toEqual({
         date: '2026-11-03',
         time: '09:00',
      })
   })

   it('should read the boxes into an instant, and refuse what is not a date or a time', () => {
      expect(fromInputs('2026-11-03', '09:00', 'Asia/Kolkata')).toEqual(new Date('2026-11-03T03:30:00.000Z'))
      expect(fromInputs('2026-02-30', '09:00', 'Asia/Kolkata')).toBeUndefined()
      expect(fromInputs('2026-11-03', '25:00', 'Asia/Kolkata')).toBeUndefined()
      expect(fromInputs('', '09:00', 'Asia/Kolkata')).toBeUndefined()
      expect(fromInputs('2026-11-03', '', 'Asia/Kolkata')).toBeUndefined()
   })
})

describe('plannedProblem', () => {
   const now = new Date('2026-10-25T10:00:00.000Z')

   it('should accept a time at least ten minutes ahead', () => {
      expect(plannedProblem(new Date(now.getTime() + MIN_LEAD_MS), now)).toBeUndefined()
   })

   it('should refuse the past and a time too close to now, with a sentence', () => {
      expect(plannedProblem(new Date(now.getTime() - 1000), now)).toMatch(/10 minutes/)
      expect(plannedProblem(new Date(now.getTime() + MIN_LEAD_MS - 1), now)).toMatch(/10 minutes/)
   })
})

describe('presets', () => {
   const zone = 'Asia/Kolkata'

   it('should offer later today, tomorrow morning and Monday morning on a Tuesday morning', () => {
      const found = presets(new Date('2026-10-27T05:00:00.000Z'), zone)

      expect(found.map(({ label }) => label)).toEqual(['Later today', 'Tomorrow morning', 'Monday morning'])
      expect(found.map(({ at }) => at.toISOString())).toEqual([
         '2026-10-27T09:30:00.000Z',
         '2026-10-28T03:30:00.000Z',
         '2026-11-02T03:30:00.000Z',
      ])
   })

   it('should leave out a preset that has passed or that repeats another', () => {
      // Sunday 15:30 in Kolkata: 3 PM has passed, and tomorrow is Monday.
      expect(presets(new Date('2026-10-25T10:00:00.000Z'), zone).map(({ label }) => label)).toEqual([
         'Tomorrow morning',
      ])
   })
})

describe('describePlanned', () => {
   it('should say the day, the time and the zone in words', () => {
      const sentence = describePlanned('2026-11-03T03:30:00.000Z', 'Asia/Kolkata')

      expect(sentence).toMatch(/Tuesday/)
      expect(sentence).toMatch(/Nov(ember)? 3/)
      expect(sentence).toMatch(/9:00\sAM/)
      expect(sentence).toMatch(/Asia\/Kolkata/)
   })
})
