import { describe, expect, it } from 'vitest'

import type { CampaignInsights, CampaignProjection, CampaignTrendDay } from '@automatedLinkedIn/contracts'

import {
   conversionRates,
   cumulativeSeries,
   gateMessage,
   listStripCounts,
   missingSetupItems,
   projectionBand,
   projectionBasis,
   projectionNote,
   sparklineSeries,
   trendPoints,
} from './campaign-insights'

type Gate = CampaignInsights['gate']

const gate = (overrides: Partial<Gate> = {}): Gate => ({
   completeDays: 14,
   missingDays: 0,
   invites: 0,
   needed: { days: 0, invites: 0 },
   ...overrides,
})

describe('gateMessage', () => {
   it('names missing data first, then the days and invites still needed', () => {
      expect(gateMessage(gate({ missingDays: 2 }))).toBe('2 complete days in the last 14 have no data.')
      expect(gateMessage(gate({ needed: { days: 1, invites: 5 } }))).toBe(
         '1 more complete day needed before a projection.'
      )
      expect(gateMessage(gate({ needed: { days: 0, invites: 5 } }))).toBe('5 more invites needed before a projection.')
   })

   it('returns null once the gate is passed', () => {
      expect(gateMessage(gate())).toBeNull()
   })
})

describe('projectionNote', () => {
   it('returns null for a shown projection', () => {
      const shown: CampaignProjection = {
         status: 'shown',
         next7: { low: 1, high: 2 },
         next30: { low: 4, high: 8 },
         basis: {
            latestPace: 1,
            previousPace: 1,
            capacity: { perDay: 20, perWeek: 100 },
            share: { perDay: 20, perWeek: 100 },
            shareDenominator: 1,
         },
      }
      expect(projectionNote(shown, gate())).toBeNull()
   })

   it('explains a too-early projection with the gate message, and a hidden reason with fixed copy', () => {
      const tooEarly: CampaignProjection = { status: 'hidden', reason: 'tooEarly' }
      expect(projectionNote(tooEarly, gate({ missingDays: 1 }))).toBe('1 complete day in the last 14 have no data.')
      expect(projectionNote(tooEarly, gate())).toBe('Too early to judge.')
      expect(projectionNote({ status: 'hidden', reason: 'paused' }, gate())).toBe(
         'Paused, so runs may stop and the pace would not hold.'
      )
   })
})

describe('trendPoints', () => {
   it('keeps counted days and leaves days that were not counted as gaps, never zeros', () => {
      const history: CampaignTrendDay[] = [
         {
            day: '2026-11-01',
            state: 'counted',
            counts: { found: 3, qualified: 1, invited: 4, accepted: 2, messaged: 0, replied: 0 },
         },
         { day: '2026-11-02', state: 'noData' },
      ]
      expect(trendPoints(history)).toEqual([
         { day: '2026-11-01', invited: 4, accepted: 2 },
         { day: '2026-11-02', invited: null, accepted: null },
      ])
   })
})

describe('missingSetupItems', () => {
   it('links each missing piece of capacity to the page that fixes it', () => {
      expect(missingSetupItems(['noAccounts', 'noDiscoverRun'])).toEqual([
         { label: 'Connect a signed-in LinkedIn account', to: '/accounts' },
         { label: 'Run a Discover workflow to find people', to: '/workflows' },
      ])
   })
})

describe('listStripCounts', () => {
   it('opens the network page filtered to this campaign label and the matching fit or status', () => {
      const [qualified, maybe, notYetHandled] = listStripCounts(
         { qualified: 4, maybe: 2, notYetHandled: 7 },
         'ai-founders'
      )
      expect(qualified?.value).toBe(4)
      expect(maybe?.value).toBe(2)
      expect(notYetHandled?.value).toBe(7)

      const filtersOf = (to: string | undefined) => JSON.parse(decodeURIComponent(to?.split('filters=')[1] ?? ''))
      expect(filtersOf(qualified?.to)).toEqual({ labels: ['ai-founders'], fit: ['STRONG'] })
      expect(filtersOf(maybe?.to)).toEqual({ labels: ['ai-founders'], fit: ['MAYBE'] })
      expect(filtersOf(notYetHandled?.to)).toEqual({ labels: ['ai-founders'], statuses: ['NEW'] })
   })
})

describe('projectionBasis', () => {
   it('states the pace and the capped share, split across the running campaigns', () => {
      expect(
         projectionBasis({
            latestPace: 3,
            previousPace: 2.5,
            capacity: { perDay: 20, perWeek: 100 },
            share: { perDay: 10, perWeek: 50 },
            shareDenominator: 2,
         })
      ).toBe(
         "Based on 3.0 invites a day over the last 7 complete days and 2.5 a day over the 7 before. Capped at this campaign's share: 10 a day and 50 a week, split across 2 campaigns."
      )
   })
})

const counted = (day: string, invited: number, accepted: number): CampaignTrendDay => ({
   day,
   state: 'counted',
   counts: { found: 0, qualified: 0, invited, accepted, messaged: 0, replied: 0 },
})

describe('sparklineSeries', () => {
   it('breaks the line on a gap day instead of dropping to zero', () => {
      const history: CampaignTrendDay[] = [counted('2026-11-01', 4, 1), { day: '2026-11-02', state: 'noData' }]
      expect(sparklineSeries(history, 'invited')).toEqual([4, null])
   })
})

describe('cumulativeSeries', () => {
   it('adds counted days only and keeps the total across a gap', () => {
      const history: CampaignTrendDay[] = [
         counted('2026-11-01', 4, 0),
         { day: '2026-11-02', state: 'noData' },
         counted('2026-11-03', 3, 0),
      ]
      expect(cumulativeSeries(history, 'invited')).toEqual([
         { day: '2026-11-01', total: 4 },
         { day: '2026-11-02', total: null },
         { day: '2026-11-03', total: 7 },
      ])
   })
})

describe('conversionRates', () => {
   it('gives no rate after a zero previous stage, not 0%', () => {
      const rates = conversionRates({ found: 0, qualified: 0, invited: 0, accepted: 0 })
      expect(rates.map(stage => stage.rate)).toEqual([null, null, null])
   })

   it('gives each stage its rate against the stage before it', () => {
      const rates = conversionRates({ found: 100, qualified: 50, invited: 10, accepted: 2 })
      expect(rates.map(stage => stage.rate)).toEqual([0.5, 0.2, 0.2])
   })
})

describe('projectionBand', () => {
   it('returns the 7 and 30 day ranges for a shown projection and null when hidden', () => {
      const shown: CampaignProjection = {
         status: 'shown',
         next7: { low: 1, high: 2 },
         next30: { low: 4, high: 8 },
         basis: {
            latestPace: 1,
            previousPace: 1,
            capacity: { perDay: 20, perWeek: 100 },
            share: { perDay: 20, perWeek: 100 },
            shareDenominator: 1,
         },
      }
      expect(projectionBand(shown)).toEqual([
         { label: 'Next 7 days', low: 1, high: 2 },
         { label: 'Next 30 days', low: 4, high: 8 },
      ])
      expect(projectionBand({ status: 'hidden', reason: 'tooEarly' })).toBeNull()
   })
})
