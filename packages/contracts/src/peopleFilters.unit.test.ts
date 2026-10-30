import { describe, expect, it } from 'vitest'

import { PEOPLE_FILTER_LIMITS, peopleFiltersSchema } from './peopleFilters'

describe('peopleFiltersSchema', () => {
   it('fills the empty lists and flags of an empty filter', () => {
      expect(peopleFiltersSchema.parse({})).toEqual({
         companies: [],
         countries: [],
         invites: [],
         labels: [],
         labelsMode: 'any',
         noLabels: false,
         neverMessaged: false,
         replyWaiting: false,
         statuses: [],
      })
   })

   it('keeps a full filter, trimming text and lower-casing labels', () => {
      const parsed = peopleFiltersSchema.parse({
         name: '  ada ',
         companies: ['Lumen Labs'],
         title: 'founder',
         countries: ['France'],
         premium: true,
         connection: 'CONNECTED',
         connectedTo: 'acc-1',
         connectedAt: {
            from: '2026-10-01T00:00:00.000Z',
            to: '2026-10-30T23:59:59.999Z',
         },
         invites: ['PENDING'],
         lastSent: { from: '2026-10-01T00:00:00.000Z' },
         labels: ['Hot'],
         labelsMode: 'all',
         statuses: ['NEW'],
         profileRead: false,
      })

      expect(parsed.name).toBe('ada')
      expect(parsed.labels).toEqual(['hot'])
      expect(parsed.connectedAt).toEqual({
         from: new Date('2026-10-01T00:00:00.000Z'),
         to: new Date('2026-10-30T23:59:59.999Z'),
      })
   })

   it('refuses a range that ends before it starts', () => {
      expect(
         peopleFiltersSchema.safeParse({
            lastTouch: {
               from: '2026-10-30T00:00:00.000Z',
               to: '2026-10-01T00:00:00.000Z',
            },
         }).success
      ).toBe(false)
   })

   it('refuses connected dates or an account with Not connected', () => {
      expect(
         peopleFiltersSchema.safeParse({
            connection: 'NOT_CONNECTED',
            connectedAt: { from: '2026-10-01T00:00:00.000Z' },
         }).success
      ).toBe(false)
   })

   it('caps the lists and the text', () => {
      const countries = Array.from({ length: PEOPLE_FILTER_LIMITS.values + 1 }, (_, i) => `C${i}`)

      expect(peopleFiltersSchema.safeParse({ countries }).success).toBe(false)
      expect(peopleFiltersSchema.safeParse({ name: 'x'.repeat(PEOPLE_FILTER_LIMITS.text + 1) }).success).toBe(false)
   })

   it('refuses an unknown key', () => {
      expect(peopleFiltersSchema.safeParse({ salary: 1 }).success).toBe(false)
   })
})
