import { describe, expect, it } from 'vitest'

import { PEOPLE_FILTER_LIMITS, PERSON_INVITE_STATES, peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import {
   FILTER_LIMITS,
   INVITE_STATES,
   NO_FILTERS,
   apiFilters,
   blockFiltersText,
   chipsOf,
   connectionsPage,
   filtersSchema,
   rangeText,
   readBlockFilters,
   readFilters,
   waitingFor,
   withWaitingFor,
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
         invitedAt: { to: '2026-10-14T23:59' },
         lastSent: { to: '2026-10-30T23:59' },
         lastReceived: {
            from: '2026-10-01T00:00',
            to: '2026-10-30T23:59',
         },
         neverMessaged: true,
         replyWaiting: true,
         waiting: true,
         lastTouch: { from: '2026-10-01T09:30' },
         firstSeen: { from: '2026-09-01T00:00' },
         labels: ['hot'],
         labelsMode: 'all',
         noLabels: false,
         statuses: ['NEW'],
         fit: ['STRONG'],
         worksAt: ['target'],
         profileRead: false,
      })

      expect(peopleFiltersSchema.safeParse(apiFilters(full)).success).toBe(true)
      expect(peopleFiltersSchema.safeParse(apiFilters(NO_FILTERS)).success).toBe(true)
   })
})

describe('filters in the address', () => {
   it("opens an account's connections with the Connected to filter on", () => {
      const url = new URL(connectionsPage('acc 1'), 'https://app.example')

      expect(url.pathname).toBe('/network/acc%201')
      expect(readFilters(url.searchParams.get('filters'))).toEqual({
         ...NO_FILTERS,
         connection: 'CONNECTED',
         connectedTo: 'acc 1',
      })
   })
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

describe('filters of a workflow block', () => {
   it('should keep only what is on, as exact instants brain accepts, and open the drawer on it again', () => {
      const filters = filtersSchema.parse({
         countries: ['France'],
         connection: 'CONNECTED',
         connectedAt: {
            from: '2026-10-01T00:00',
            to: '2026-10-30T23:59',
         },
         replyWaiting: true,
      })
      const text = blockFiltersText(filters)

      expect(Object.keys(JSON.parse(text)).sort()).toEqual(['connectedAt', 'connection', 'countries', 'replyWaiting'])
      expect(peopleFiltersSchema.safeParse(JSON.parse(text)).success).toBe(true)
      expect(readBlockFilters(text)).toEqual(filters)
   })

   it('should keep nothing for no filters, and read text that is not filters as none', () => {
      expect(blockFiltersText(NO_FILTERS)).toBe('')
      expect(readBlockFilters('')).toEqual(NO_FILTERS)
      expect(readBlockFilters('oops')).toEqual(NO_FILTERS)
      expect(readBlockFilters('{"connectedAt":{"from":"not a date"}}')).toEqual(NO_FILTERS)
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
               skills: ['Salesforce', 'HubSpot'],
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
         'Skills (all): Salesforce, HubSpot',
         'Not Premium',
         'Connected to Tripti',
         'Last reply from them: 1 Oct 2026 – 30 Oct 2026',
      ])
   })

   it('shows a time only when it is not the edge of the day', () => {
      expect(rangeText({ from: '2026-10-01T09:30' })).toBe('since 1 Oct 2026, 09:30')
   })
})

describe('waiting for at least N days', () => {
   const now = new Date(2026, 9, 30, 12, 0)

   it('should ask for people whose last message from you is that old, and read it back', () => {
      const week = withWaitingFor(NO_FILTERS, 7, now)

      expect(week.lastSent).toEqual({ to: '2026-10-23T23:59' })
      expect(waitingFor(week, now)).toBe(7)
   })

   it('should clear the range, and not mistake another range for it', () => {
      expect(withWaitingFor(withWaitingFor(NO_FILTERS, 7, now), null, now).lastSent).toEqual({})
      expect(waitingFor(NO_FILTERS, now)).toBeUndefined()
      expect(waitingFor({ ...NO_FILTERS, lastSent: { from: '2026-10-01T00:00', to: '2026-10-23T23:59' } }, now)).toBeUndefined()
   })
})
