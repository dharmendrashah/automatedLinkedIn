import { describe, expect, it } from 'vitest'

import type { DashboardOverview, SeriesKey } from '@automatedLinkedIn/contracts'

import { chartDescription, sliceSeries, toggleSeries } from './chart-series'

type Day = DashboardOverview['series'][number]

// Day i has found i, qualified 1, invited 2 and accepted 0.
const dayOf = (index: number, overrides: Partial<Day> = {}): Day => ({
   day: `day-${index}`,
   counted: 2,
   campaigns: 2,
   found: index,
   qualified: 1,
   invited: 2,
   accepted: 0,
   ...overrides,
})

const series = Array.from({ length: 90 }, (_, index) => dayOf(index))

describe('sliceSeries', () => {
   it('should keep the newest days and sum them', () => {
      const { days, totals, partialDays } = sliceSeries(series, 7)

      expect(days.map(({ day }) => day)).toEqual(['day-83', 'day-84', 'day-85', 'day-86', 'day-87', 'day-88', 'day-89'])
      expect(totals).toEqual({
         found: 83 + 84 + 85 + 86 + 87 + 88 + 89,
         qualified: 7,
         invited: 14,
         accepted: 0,
      })
      expect(partialDays).toBe(0)
   })

   it('should slice 30 and 90 days', () => {
      expect(sliceSeries(series, 30).days).toHaveLength(30)
      expect(sliceSeries(series, 90).days).toHaveLength(90)
   })

   it('should not add a gap day to the totals and not count it as partial', () => {
      const gap = dayOf(89, { counted: 0, found: null, qualified: null, invited: null, accepted: null })
      const { totals, partialDays } = sliceSeries([dayOf(88), gap], 7)

      expect(totals).toEqual({
         found: 88,
         qualified: 1,
         invited: 2,
         accepted: 0,
      })
      expect(partialDays).toBe(0)
   })

   it('should count a day with some but not all campaigns as partial', () => {
      const days = [dayOf(1, { counted: 1, campaigns: 2 }), dayOf(2)]

      expect(sliceSeries(days, 7).partialDays).toBe(1)
   })

   it('should take everything when there are fewer days than asked', () => {
      expect(sliceSeries([dayOf(1)], 30).days).toHaveLength(1)
   })
})

describe('chartDescription', () => {
   const totals = {
      found: 10,
      qualified: 4,
      invited: 6,
      accepted: 2,
   }
   const all = new Set<SeriesKey>(['found', 'qualified', 'invited', 'accepted'])

   it('should name every active series in draw order', () => {
      expect(chartDescription({ totals, dayCount: 30, partialDays: 0, active: all })).toBe(
         'Found 10, qualified 4, invited 6, accepted 2 in the last 30 days'
      )
   })

   it('should leave out a switched-off series', () => {
      const active = new Set<SeriesKey>(['invited', 'found'])

      expect(chartDescription({ totals, dayCount: 7, partialDays: 0, active })).toBe(
         'Found 10, invited 6 in the last 7 days'
      )
   })

   it('should say 3 months for 90 days and add the partial days', () => {
      const active = new Set<SeriesKey>(['accepted'])

      expect(chartDescription({ totals, dayCount: 90, partialDays: 3, active })).toBe(
         'Accepted 2 in the last 3 months, partial on 3 days'
      )
      expect(chartDescription({ totals, dayCount: 90, partialDays: 1, active })).toBe(
         'Accepted 2 in the last 3 months, partial on 1 day'
      )
   })
})

describe('toggleSeries', () => {
   it('should switch a series off and on without changing the input', () => {
      const active = new Set<SeriesKey>(['found', 'qualified'])
      const off = toggleSeries(active, 'found')

      expect([...off]).toEqual(['qualified'])
      expect([...toggleSeries(off, 'found')].sort()).toEqual(['found', 'qualified'])
      expect(active.size).toBe(2)
   })

   it('should keep the last series on', () => {
      expect([...toggleSeries(new Set<SeriesKey>(['accepted']), 'accepted')]).toEqual(['accepted'])
   })
})
