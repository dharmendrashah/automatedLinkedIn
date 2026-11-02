import { describe, expect, it } from 'vitest'

import {
   type Graph,
   type NodeConfig,
   addedSince,
   blockOf,
   errorsOf,
   inputPickOf,
   timeFrameOf,
   validateGraph,
} from './workflow'

const WEDNESDAY = new Date('2026-11-04T10:00:00Z')
const KOLKATA = 'Asia/Kolkata'

const frame = (added: string, extra: Record<string, string> = {}, now = WEDNESDAY, lastRunAt: Date | null = null) => {
   const { from, until } = timeFrameOf(
      inputPickOf('input.profiles', {
         added,
         timeZone: KOLKATA,
         ...extra,
      }),
      now,
      lastRunAt
   )

   return [from?.toISOString() ?? null, until?.toISOString() ?? null]
}

describe('the time frame of an input block', () => {
   it('should take any time as open on both sides', () => {
      expect(frame('any')).toEqual([null, null])
   })

   it('should start today and this week at midnight of the saved day, weeks on Monday', () => {
      expect(frame('today')).toEqual(['2026-11-03T18:30:00.000Z', null])
      expect(frame('week')).toEqual(['2026-11-01T18:30:00.000Z', null])
      expect(frame('week', {}, new Date('2026-11-02T10:00:00Z'))).toEqual(['2026-11-01T18:30:00.000Z', null])
      expect(frame('week', {}, new Date('2026-11-08T10:00:00Z'))).toEqual(['2026-11-01T18:30:00.000Z', null])
   })

   it('should take yesterday and last month as a closed range, and this month from its first day', () => {
      expect(frame('yesterday')).toEqual(['2026-11-02T18:30:00.000Z', '2026-11-03T18:30:00.000Z'])
      expect(frame('month')).toEqual(['2026-10-31T18:30:00.000Z', null])
      expect(frame('lastMonth')).toEqual(['2026-09-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z'])
   })

   it('should count 7 and 30 days back from now, and 3 months back to the same day, not past the end of a short month', () => {
      expect(frame('7d')).toEqual(['2026-10-28T10:00:00.000Z', null])
      expect(frame('30d')).toEqual(['2026-10-05T10:00:00.000Z', null])
      expect(frame('3months')).toEqual(['2026-08-03T18:30:00.000Z', null])
      expect(frame('3months', {}, new Date('2026-05-31T10:00:00Z'))).toEqual(['2026-02-27T18:30:00.000Z', null])
   })

   it('should start a custom range at its first day and end it after its last day, either may be empty', () => {
      expect(
         frame('custom', {
            from: '2026-10-01',
            to: '2026-10-31',
         })
      ).toEqual(['2026-09-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z'])
      expect(frame('custom', { from: '2026-10-01' })).toEqual(['2026-09-30T18:30:00.000Z', null])
      expect(frame('custom', { to: '2026-10-31' })).toEqual([null, '2026-10-31T18:30:00.000Z'])
   })

   it('should start after the last run, and keep addedSince giving the start', () => {
      const lastRun = new Date('2026-11-01T01:00:00Z')

      expect(frame('lastRun', {}, WEDNESDAY, lastRun)).toEqual(['2026-11-01T01:00:00.000Z', null])
      expect(
         addedSince(
            inputPickOf('input.posts', {
               added: 'today',
               timeZone: KOLKATA,
            }),
            WEDNESDAY,
            null
         )?.toISOString()
      ).toBe('2026-11-03T18:30:00.000Z')
   })

   it('should follow the saved zone across a clock change', () => {
      const { from } = timeFrameOf(
         inputPickOf('input.posts', {
            added: 'today',
            timeZone: 'America/New_York',
         }),
         new Date('2026-11-01T12:00:00Z'),
         null
      )

      // The clocks went back that night: midnight of 1 November was still on summer time.
      expect(from?.toISOString()).toBe('2026-11-01T04:00:00.000Z')
   })
})

const alone = (type: 'input.posts' | 'input.profiles' | 'input.companies', config: NodeConfig): Graph => ({
   nodes: [
      {
         id: 'pick',
         type,
         config,
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const problems = (type: 'input.posts' | 'input.profiles' | 'input.companies', config: NodeConfig) =>
   errorsOf(validateGraph(alone(type, config))).map(({ message }) => message)

describe('the settings of the time frame', () => {
   it('should keep a block saved before as it was: added, no custom dates', () => {
      expect(blockOf('input.posts').config.parse({ added: 'week' })).toMatchObject({
         added: 'week',
         dateField: 'added',
         from: '',
         to: '',
      })
   })

   it('should ask for a day when the dates are custom, and for dates in order', () => {
      expect(problems('input.profiles', { added: 'custom' })).toEqual([
         'Profiles: pick the first or the last day of the custom dates.',
      ])
      expect(
         problems('input.profiles', {
            added: 'custom',
            from: '2026-11-02',
            to: '2026-11-01',
         })
      ).toEqual(['Profiles: the custom dates end before they start.'])
      expect(
         problems('input.profiles', {
            added: 'custom',
            from: '2026-11-01',
         })
      ).toEqual([])
   })

   it('should refuse a date a block cannot look at and a day that is not a day', () => {
      expect(problems('input.posts', { dateField: 'lastRead' })).toEqual([
         'Posts: this block cannot look at that date.',
      ])
      expect(problems('input.companies', { dateField: 'lastRead' })).toEqual([])
      expect(problems('input.posts', { dateField: 'posted' })).toEqual([])
      expect(
         problems('input.posts', {
            added: 'custom',
            from: 'tomorrow',
         })
      ).toHaveLength(1)
   })

   it('should offer the date to look at where there is a choice (profiles only from My network), and quick numbers for the limit', () => {
      const field = (type: 'input.posts' | 'input.profiles' | 'input.companies') =>
         blockOf(type).fields.find(({ key }) => key === 'dateField')

      expect(field('input.posts')).toBeDefined()
      expect(field('input.profiles')?.showWhen).toEqual({
         key: 'source',
         is: 'network',
      })

      const limit = blockOf('input.profiles').fields.find(({ key }) => key === 'howMany')
      const quick = [10, 25, 50, 100, 200]

      expect(limit).toMatchObject({ quick })
   })
})
