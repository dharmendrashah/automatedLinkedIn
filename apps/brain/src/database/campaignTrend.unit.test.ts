import { describe, expect, it } from 'vitest'

import type { CampaignCounts, CampaignTrendDay } from '@automatedLinkedIn/contracts'

import {
   cutoffOf,
   dayKeyOf,
   gateOf,
   gatePasses,
   historyDays,
   paceOf,
   projectionOf,
   shareOf,
   sinceOf,
   totalsOf,
   trendDays,
   windowDays,
} from './campaignTrend'

const NOW = new Date('2026-11-13T12:00:00.000Z')

const counts = (invited: number): CampaignCounts => ({
   found: 5,
   qualified: 3,
   invited,
   accepted: 1,
   messaged: 2,
   replied: 1,
})

const counted = (day: string, invited: number): CampaignTrendDay => ({
   day,
   state: 'counted',
   counts: counts(invited),
})

const fourteenDays = windowDays(NOW)

const fullWindow = (invitedPerDay: number): CampaignTrendDay[] => fourteenDays.map(day => counted(day, invitedPerDay))

const usableProjection = {
   gatePassed: true,
   usableAccounts: 2,
   paused: false,
   walletLow: false,
}

describe('campaignTrend', () => {
   it('should use only days at least two days old as the window', () => {
      expect(cutoffOf(NOW)).toBe('2026-11-11')
      expect(windowDays(NOW)).toHaveLength(14)
      expect(windowDays(NOW).at(-1)).toBe('2026-11-11')
      expect(historyDays(7, NOW).at(-1)).toBe(dayKeyOf(NOW))
   })

   it('should fail the gate with 13 complete days and pass with 14 and 20 invites', () => {
      const thirteen = fullWindow(2).map((entry, index) =>
         index === 0
            ? {
                 day: entry.day,
                 state: 'notStarted' as const,
              }
            : entry
      )
      expect(gatePasses(gateOf(thirteen))).toBe(false)
      expect(gateOf(thirteen).needed.days).toBe(1)

      const fourteen = fullWindow(2)
      expect(gateOf(fourteen).invites).toBe(28)
      expect(gatePasses(gateOf(fourteen))).toBe(true)
   })

   it('should fail the gate with fewer than 20 invites even on 14 complete days', () => {
      const gate = gateOf(fullWindow(1))
      expect(gate.invites).toBe(14)
      expect(gate.needed.invites).toBe(6)
      expect(gatePasses(gate)).toBe(false)
   })

   it('should fail the gate when one complete day in the window has no rollup row', () => {
      const window = fullWindow(3)
      window[5] = {
         day: window[5].day,
         state: 'noData',
      }
      const gate = gateOf(window)
      expect(gate.missingDays).toBe(1)
      expect(gatePasses(gate)).toBe(false)
   })

   it('should mark today and yesterday without a row as pending, not zero', () => {
      const days = trendDays(['2026-11-12', '2026-11-13'], {
         creationDay: '2026-10-01',
         since: '2026-10-01',
         cutoff: cutoffOf(NOW),
         rows: new Map(),
      })
      expect(days.map(entry => entry.state)).toEqual(['pending', 'pending'])
   })

   it('should classify days before creation, before since and with no row', () => {
      const days = trendDays(['2026-09-30', '2026-10-01', '2026-10-05', '2026-10-06'], {
         creationDay: '2026-10-01',
         since: '2026-10-05',
         cutoff: '2026-11-11',
         rows: new Map([['2026-10-05', counts(4)]]),
      })
      expect(days.map(entry => entry.state)).toEqual(['notStarted', 'beforeHistory', 'counted', 'noData'])
   })

   it('should start since at the later of the creation day and the first row', () => {
      expect(sinceOf('2026-10-01', null)).toBeNull()
      expect(sinceOf('2026-10-01', '2026-09-20')).toBe('2026-10-01')
      expect(sinceOf('2026-10-01', '2026-10-04')).toBe('2026-10-04')
   })

   it('should sum found and invited but skip noData days and never sum messaged', () => {
      const history: CampaignTrendDay[] = [
         counted('2026-11-01', 4),
         {
            day: '2026-11-02',
            state: 'noData',
         },
         counted('2026-11-03', 6),
      ]
      const totals = totalsOf(history, true)
      expect(totals).toEqual({
         found: 10,
         qualified: 6,
         invited: 10,
         accepted: 2,
         skippedDays: 1,
         sinceApplies: true,
      })
      expect(totals).not.toHaveProperty('messaged')
   })

   it('should reduce a paused campaign share by counting the campaign itself', () => {
      expect(
         shareOf(
            {
               perDay: 20,
               perWeek: 100,
            },
            2,
            false
         ).denominator
      ).toBe(2)
      expect(
         shareOf(
            {
               perDay: 20,
               perWeek: 100,
            },
            2,
            true
         ).denominator
      ).toBe(3)
      expect(
         shareOf(
            {
               perDay: 20,
               perWeek: 100,
            },
            0,
            false
         ).share.perDay
      ).toBe(20)
   })

   it('should cap the projection by the daily and weekly share and keep low at or below high', () => {
      const share = {
         perDay: 10,
         perWeek: 40,
      }
      const projection = projectionOf({
         ...usableProjection,
         capacity: {
            perDay: 20,
            perWeek: 100,
         },
         share,
         shareDenominator: 2,
         latestPace: 2,
         previousPace: 30,
      })
      if (projection.status !== 'shown') throw new Error('expected a shown projection')
      // Pace 2 is limited by its own rate (2 x 7); pace 30 is limited by the daily cap (10 x 7) and then the weekly cap (40).
      expect(projection.next7).toEqual({
         low: 14,
         high: 40,
      })
      // Monthly: pace 2 gives 2 x 30 = 60; pace 30 hits the weekly cap scaled to 30 days (40 x 30 / 7 = 171).
      expect(projection.next30).toEqual({
         low: 60,
         high: 171,
      })
      expect(paceOf(fullWindow(3))).toEqual({
         latestPace: 3,
         previousPace: 3,
      })
   })

   it('should hide the projection in the documented reason order', () => {
      const base = {
         ...usableProjection,
         capacity: {
            perDay: 20,
            perWeek: 100,
         },
         share: {
            perDay: 10,
            perWeek: 50,
         },
         shareDenominator: 2,
         latestPace: 5,
         previousPace: 5,
      }
      expect(
         projectionOf({
            ...base,
            gatePassed: false,
            usableAccounts: 0,
            paused: true,
         })
      ).toEqual({
         status: 'hidden',
         reason: 'tooEarly',
      })
      expect(
         projectionOf({
            ...base,
            usableAccounts: 0,
            paused: true,
         })
      ).toEqual({
         status: 'hidden',
         reason: 'noAccounts',
      })
      expect(
         projectionOf({
            ...base,
            paused: true,
            walletLow: true,
         })
      ).toEqual({
         status: 'hidden',
         reason: 'paused',
      })
      expect(
         projectionOf({
            ...base,
            walletLow: true,
         })
      ).toEqual({
         status: 'hidden',
         reason: 'walletLow',
      })
   })
})
