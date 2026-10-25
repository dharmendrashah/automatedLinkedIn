import { describe, expect, it } from 'vitest'

import { type DayUsage } from './types'

import { buildYear, dayLabel, lastDays, levelOf, summaryText, tooltipText } from './heatmap-grid'

const usage = (day: string, seconds: number, sessions = 1, limitSeconds = 90 * 60): DayUsage => ({
   day,
   seconds,
   sessions,
   limitSeconds,
})

describe('levelOf', () => {
   it('should map the share of the limit to five steps and an over-the-limit step', () => {
      const limit = 90 * 60

      expect(levelOf(0, limit)).toBe(0)
      expect(levelOf(10 * 60, limit)).toBe(1)
      expect(levelOf(22.5 * 60, limit)).toBe(1)
      expect(levelOf(30 * 60, limit)).toBe(2)
      expect(levelOf(67.5 * 60, limit)).toBe(3)
      expect(levelOf(80 * 60, limit)).toBe(4)
      expect(levelOf(90 * 60, limit)).toBe(4)
      expect(levelOf(94 * 60, limit)).toBe('over')
   })
})

describe('buildYear', () => {
   // 2026-10-25 is a Sunday.
   const grid = buildYear([usage('2026-10-23', 74 * 60, 9)], '2026-10-25')

   it('should be 53 weeks of 7 days, Monday first, ending the week of the last day', () => {
      expect(grid.weeks).toHaveLength(53)
      expect(grid.weeks.every(week => week.length === 7)).toBe(true)
      expect(grid.weeks[52]?.[0]?.day).toBe('2026-10-19')
      expect(grid.weeks[52]?.[6]?.day).toBe('2026-10-25')
      expect(grid.weeks[0]?.[0]?.day).toBe('2025-10-20')
   })

   it('should leave the days after the last day blank', () => {
      const midweek = buildYear([], '2026-10-22')

      expect(midweek.weeks[52]?.[3]?.day).toBe('2026-10-22')
      expect(midweek.weeks[52]?.[4]).toBeNull()
      expect(midweek.weeks[52]?.[6]).toBeNull()
   })

   it('should carry what each day used, and zero for a day with nothing', () => {
      expect(grid.weeks[52]?.[4]).toMatchObject({
         day: '2026-10-23',
         seconds: 74 * 60,
         sessions: 9,
      })
      expect(grid.weeks[52]?.[5]).toMatchObject({
         day: '2026-10-24',
         seconds: 0,
         sessions: 0,
      })
   })

   it('should name a month above the first week it starts in, without crowding two names together', () => {
      const names = grid.months.map(({ label }) => label)

      expect(names).toContain('Jan')
      expect(names).toContain('Oct')
      expect(new Set(names.slice(1)).size).toBe(names.slice(1).length)

      for (let index = 1; index < grid.months.length; index += 1) {
         expect((grid.months[index]?.week ?? 0) - (grid.months[index - 1]?.week ?? 0)).toBeGreaterThanOrEqual(3)
      }
   })

   it('should end a past year on its last day', () => {
      const past = buildYear([], '2025-12-31')

      expect(past.weeks[52]?.[2]?.day).toBe('2025-12-31')
      expect(past.weeks[52]?.[3]).toBeNull()
   })
})

describe('words', () => {
   it('should write a day the way the tooltip shows it', () => {
      expect(dayLabel('2026-10-14')).toBe('Wed 14 Oct')
   })

   it('should say what a day used, and its share of the limit', () => {
      expect(
         tooltipText({
            day: '2026-10-14',
            seconds: 74 * 60,
            sessions: 9,
            limitSeconds: 90 * 60,
         })
      ).toBe('Wed 14 Oct: 74 min of 90 (82%), 9 sessions')
      expect(
         tooltipText({
            day: '2026-10-14',
            seconds: 100 * 60,
            sessions: 1,
            limitSeconds: 90 * 60,
         })
      ).toBe('Wed 14 Oct: 1 h 40 min of 90 min, over the limit, 1 session')
      expect(tooltipText({ day: '2026-10-14', seconds: 0, sessions: 0, limitSeconds: 90 * 60 })).toBe(
         'Wed 14 Oct: no browsing'
      )
   })

   it('should sum a year in a line', () => {
      expect(summaryText([usage('2026-10-01', 30 * 60), usage('2026-10-02', 96 * 60), usage('2026-10-03', 0, 0)])).toBe(
         '2 h 6 min · 2 active days · busiest day 1 h 36 min'
      )
      expect(summaryText([])).toBe('Nothing browsed yet')
   })

   it('should list the last days, oldest first', () => {
      expect(lastDays('2026-03-02', 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
   })
})
