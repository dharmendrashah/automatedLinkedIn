import { describe, expect, it } from 'vitest'

import type { CampaignCounts } from '@automatedLinkedIn/contracts'

import { type ListCampaign, type ListOwner, listRowOf } from './campaignList'
import { windowDays } from './campaignTrend'

const NOW = new Date('2026-11-13T12:00:00.000Z')
const WINDOW = windowDays(NOW)

const counts = (invited: number): CampaignCounts => ({
   found: 5,
   qualified: 3,
   invited,
   accepted: 1,
   messaged: 2,
   replied: 1,
})

const rowsFor = (days: string[], invited = 2) => new Map(days.map(day => [day, counts(invited)]))

const campaign = (overrides: Partial<ListCampaign> = {}): ListCampaign => ({
   id: 'campaign-1',
   name: 'Founders',
   workflows: 2,
   pausedAt: null,
   createdAt: new Date('2026-09-01T00:00:00.000Z'),
   ...overrides,
})

const owner = (overrides: Partial<ListOwner> = {}): ListOwner => ({
   capacity: {
      perDay: 10,
      perWeek: 50,
      usableAccounts: 2,
   },
   runningCampaigns: 2,
   walletLow: false,
   ...overrides,
})

const rowOf = (overrides: { campaign?: ListCampaign; owner?: ListOwner; rows?: Map<string, CampaignCounts> } = {}) =>
   listRowOf({
      campaign: overrides.campaign ?? campaign(),
      owner: overrides.owner ?? owner(),
      now: NOW,
      firstRowDay: '2026-09-01',
      rows: overrides.rows ?? rowsFor(WINDOW),
   })

describe('campaignList', () => {
   it('should show no numbers and no projection for a campaign without workflows', () => {
      const row = rowOf({ campaign: campaign({ workflows: 0 }) })

      expect(row.state).toBe('NO_WORKFLOWS')
      expect(row.numbers).toBeNull()
      expect(row.projection).toBeNull()
   })

   it('should show no numbers for a campaign that has no rollup history yet', () => {
      const row = listRowOf({
         campaign: campaign({ createdAt: NOW }),
         owner: owner(),
         now: NOW,
         firstRowDay: null,
         rows: new Map(),
      })

      expect(row.state).toBe('NOT_STARTED')
      expect(row.numbers).toBeNull()
   })

   it('should sum the 14-day window into the four list numbers', () => {
      const row = rowOf()

      expect(row.state).toBe('RUNNING')
      expect(row.numbers).toEqual({
         qualified: 42,
         invited: 28,
         acceptRate: 0.5,
         replied: 14,
      })
   })

   it('should show a 30-day projection once the gate passes', () => {
      const row = rowOf()

      expect(row.gate.completeDays).toBe(14)
      expect(row.projection).toMatchObject({
         status: 'shown',
         basis: { shareDenominator: 2 },
      })
   })

   it('should keep the numbers but hide the projection for a paused campaign', () => {
      const row = rowOf({ campaign: campaign({ pausedAt: new Date('2026-11-10T00:00:00.000Z') }) })

      expect(row.state).toBe('PAUSED')
      expect(row.numbers?.invited).toBe(28)
      expect(row.projection).toEqual({
         status: 'hidden',
         reason: 'paused',
      })
   })

   it('should hide the projection until 14 complete days and 20 invites', () => {
      const fiveDays = WINDOW.slice(-5)
      const row = rowOf({ rows: rowsFor(fiveDays) })

      expect(row.gate.completeDays).toBe(5)
      expect(row.projection).toEqual({
         status: 'hidden',
         reason: 'tooEarly',
      })
      expect(row.numbers?.invited).toBe(10)
   })

   it('should hide the projection when the account has no capacity or the wallet is low', () => {
      expect(
         rowOf({
            owner: owner({
               capacity: {
                  perDay: 0,
                  perWeek: 0,
                  usableAccounts: 2,
               },
            }),
         }).projection
      ).toEqual({
         status: 'hidden',
         reason: 'zeroCap',
      })
      expect(rowOf({ owner: owner({ walletLow: true }) }).projection).toEqual({
         status: 'hidden',
         reason: 'walletLow',
      })
   })
})
