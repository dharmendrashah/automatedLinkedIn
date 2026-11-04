import { describe, expect, it } from 'vitest'

import {
   CAMPAIGN_LIMITS,
   type HealthSignals,
   acceptDropped,
   campaignLabelOf,
   healthOf,
   isSmallSample,
   periodStart,
   rateOf,
} from './campaign'
import { PENDING_NOTICE_AT, PENDING_PAUSE_AT } from './limits'

const calm: HealthSignals = {
   status: 'ACTIVE',
   invitesStopped: false,
   engageStopped: false,
   pending: 400,
   invitesNow: 30,
   acceptedNow: 9,
   invitesBefore: 30,
   acceptedBefore: 9,
   troubleActs: 0,
   signedOutRecently: false,
}

describe('campaignLabelOf', () => {
   it('should make a label of at most 30 characters from the name', () => {
      expect(campaignLabelOf('Outbound for agencies')).toBe('lead-outbound-for-agencies')
      expect(campaignLabelOf('  Caf\u00e9 &  Bar!! ')).toBe('lead-cafe-bar')
      expect(campaignLabelOf('x'.repeat(80))).toHaveLength(29)
      expect(campaignLabelOf('!!!')).toBe('lead-campaign')
   })
})

describe('periodStart', () => {
   const now = new Date('2026-11-04T15:30:00Z')

   it('should start Today at midnight UTC and count the others back from now', () => {
      expect(periodStart('today', now).toISOString()).toBe('2026-11-04T00:00:00.000Z')
      expect(periodStart('7d', now).toISOString()).toBe('2026-10-28T15:30:00.000Z')
      expect(periodStart('30d', now).toISOString()).toBe('2026-10-05T15:30:00.000Z')
   })
})

describe('small samples', () => {
   it('should call a group under 30 people small, and have no rate of nobody', () => {
      expect(isSmallSample(CAMPAIGN_LIMITS.smallSample - 1)).toBe(true)
      expect(isSmallSample(CAMPAIGN_LIMITS.smallSample)).toBe(false)
      expect(rateOf(1, 0)).toBeNull()
      expect(rateOf(1, 4)).toBe(0.25)
   })
})

describe('healthOf', () => {
   it('should be healthy when nothing is wrong, with no reasons', () => {
      expect(healthOf(calm)).toEqual({
         word: 'HEALTHY',
         reasons: [],
      })
   })

   it('should warn at 80 percent of the pending requests and pause at the cap', () => {
      expect(
         healthOf({
            ...calm,
            pending: PENDING_NOTICE_AT - 1,
         }).word
      ).toBe('HEALTHY')
      expect(
         healthOf({
            ...calm,
            pending: PENDING_NOTICE_AT,
         }).word
      ).toBe('WARNING')
      expect(
         healthOf({
            ...calm,
            pending: PENDING_PAUSE_AT,
         })
      ).toMatchObject({
         word: 'PAUSED',
         reasons: [expect.stringContaining('new invites are paused')],
      })
   })

   it('should pause for a restriction, a pause by the owner and stopped invites, and warn for the rest', () => {
      expect(
         healthOf({
            ...calm,
            status: 'BLOCKED',
         }).word
      ).toBe('PAUSED')
      expect(
         healthOf({
            ...calm,
            status: 'DISABLED',
         }).word
      ).toBe('PAUSED')
      expect(
         healthOf({
            ...calm,
            invitesStopped: true,
         }).word
      ).toBe('PAUSED')
      expect(
         healthOf({
            ...calm,
            status: 'NEEDS_REAUTH',
         }).word
      ).toBe('WARNING')
      expect(
         healthOf({
            ...calm,
            engageStopped: true,
         }).word
      ).toBe('WARNING')
      expect(
         healthOf({
            ...calm,
            signedOutRecently: true,
         }).word
      ).toBe('WARNING')
      expect(
         healthOf({
            ...calm,
            troubleActs: 1,
         }).word
      ).toBe('WARNING')
   })

   it('should list every reason, the worst first, and never call an account safe', () => {
      const { reasons } = healthOf({
         ...calm,
         status: 'BLOCKED',
         troubleActs: 2,
      })

      expect(reasons[0]).toBe('LinkedIn restricted this account.')
      expect(reasons).toHaveLength(2)
      expect(JSON.stringify(reasons).toLowerCase()).not.toContain('safe')
   })
})

describe('acceptDropped', () => {
   it('should fire only when the rate fell under half, on enough invites on both sides', () => {
      expect(
         acceptDropped({
            invitesNow: 40,
            acceptedNow: 4,
            invitesBefore: 40,
            acceptedBefore: 16,
         })
      ).toBe(true)
      expect(
         acceptDropped({
            invitesNow: 40,
            acceptedNow: 8,
            invitesBefore: 40,
            acceptedBefore: 16,
         })
      ).toBe(false)
      expect(
         acceptDropped({
            invitesNow: 10,
            acceptedNow: 0,
            invitesBefore: 40,
            acceptedBefore: 16,
         })
      ).toBe(false)
      expect(
         acceptDropped({
            invitesNow: 40,
            acceptedNow: 0,
            invitesBefore: 40,
            acceptedBefore: 0,
         })
      ).toBe(false)
   })
})
