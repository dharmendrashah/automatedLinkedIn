import { describe, expect, it } from 'vitest'

import { PEOPLE_FILTER_LIMITS, PERSON_INVITE_STATES, peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import {
   FILTER_LIMITS,
   INVITE_STATES,
   NO_FILTERS,
   apiFilters,
   chipsOf,
   filtersSchema,
   rangeText,
   readFilters,
   writeFilters,
} from './model'

describe('the page copy of the filter schema', () => {
   it('has the same fields, values and limits as brain', () => {
      expect(Object.keys(filtersSchema.shape).sort()).toEqual(Object.keys(peopleFiltersSchema.shape).sort())
      expect(INVITE_STATES).toEqual(PERSON_INVITE_STATES)
      expect(FILTER_LIMITS).toEqual(PEOPLE_FILTER_LIMITS)
   })

   it('sends what brain accepts', () => {
      const full = filtersSchema.parse({
         name: 'ada',
         companies: ['Kite'],
         title: 'founder',
         countries: ['France'],
         premium: true,
         connection: 'CONNECTED',
         connectedTo: 'acc-1',
         connectedAt: { from: '2026-10-01T00:00' },
         invites: ['PENDING'],
         lastSent: { to: '2026-10-30T23:59' },
         lastReceived: {
            from: '2026-10-01T00:00',
            to: '2026-10-30T23:59',
         },
         neverMessaged: true,
         replyWaiting: true,
         lastTouch: { from: '2026-10-01T09:30' },
         firstSeen: { from: '2026-09-01T00:00' },
         labels: ['hot'],
         labelsMode: 'all',
         noLabels: false,
         statuses: ['NEW'],
         profileRead: false,
      })

      expect(peopleFiltersSchema.safeParse(apiFilters(full)).success).toBe(true)
      expect(peopleFiltersSchema.safeParse(apiFilters(NO_FILTERS)).success).toBe(true)
   })
})

describe('filters in the address', () => {
   it('writes only what is on, and reads it back', () => {
      const filters = {
         ...NO_FILTERS,
         countries: ['France'],
         connection: 'CONNECTED' as const,
         lastTouch: { from: '2026-10-01T00:00' },
      }
      const written = writeFilters(filters)

      expect(JSON.parse(written ?? '')).toEqual({
         countries: ['France'],
         connection: 'CONNECTED',
         lastTouch: { from: '2026-10-01T00:00' },
      })
      expect(readFilters(written)).toEqual(filters)
      expect(writeFilters(NO_FILTERS)).toBeNull()
   })

   it.each([
      ['not json', '{'],
      ['an unknown key', '{"salary":1}'],
      ['a bad date', '{"lastTouch":{"from":"yesterday"}}'],
      ['dates with Not connected', '{"connection":"NOT_CONNECTED","connectedAt":{"from":"2026-10-01T00:00"}}'],
   ])('drops %s', (_, value) => {
      expect(readFilters(value)).toEqual(NO_FILTERS)
   })
})

describe('apiFilters', () => {
   it('sends local moments as instants, a to-minute to its last millisecond, and drops empty ranges', () => {
      const sent = apiFilters({
         ...NO_FILTERS,
         lastTouch: {
            from: '2026-10-01T00:00',
            to: '2026-10-30T23:59',
         },
      })

      expect(sent.lastTouch).toEqual({
         from: new Date(2026, 9, 1, 0, 0).toISOString(),
         to: new Date(2026, 9, 30, 23, 59, 59, 999).toISOString(),
      })
      expect(sent.connectedAt).toBeUndefined()
   })
})

describe('chipsOf', () => {
   it('names each filter that is on, whole days without their times', () => {
      expect(
         chipsOf(
            {
               ...NO_FILTERS,
               countries: ['France', 'Germany', 'Spain'],
               connection: 'CONNECTED',
               connectedTo: 'acc-1',
               lastReceived: {
                  from: '2026-10-01T00:00',
                  to: '2026-10-30T23:59',
               },
               premium: false,
            },
            () => 'Tripti'
         ).map(({ text }) => text)
      ).toEqual([
         'Country: France, Germany +1',
         'Not Premium',
         'Connected to Tripti',
         'Last reply from them: 1 Oct 2026 – 30 Oct 2026',
      ])
   })

   it('shows a time only when it is not the edge of the day', () => {
      expect(rangeText({ from: '2026-10-01T09:30' })).toBe('since 1 Oct 2026, 09:30')
   })
})
