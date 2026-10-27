import { describe, expect, it } from 'vitest'

import { type AccountBrowse } from './types'

import { bucketOf, countBuckets, needAttention } from './overview'

const hours = {
   days: [1, 2, 3, 4, 5],
   startMinute: 540,
   endMinute: 1080,
   timeZone: 'Asia/Kolkata',
}

const account = (id: string, patch: Partial<AccountBrowse> = {}): AccountBrowse => ({
   accountId: id,
   email: `${id}@example.com`,
   clientLabel: null,
   mode: 'SAFE',
   usedSeconds: 30 * 60,
   state: 'OPEN',
   nextAt: null,
   hours,
   proxyTimeZone: 'Asia/Kolkata',
   last30: [],
   idleWorkingDays: 0,
   overLimitDays14: 0,
   viewsLeft: 5,
   ...patch,
})

describe('bucketOf', () => {
   it('should put each account in one place, the most urgent first', () => {
      expect(bucketOf(account('a', { state: 'NOT_BROWSING' }))).toBe('NOT_BROWSING')
      expect(bucketOf(account('a', { state: 'DAY_FULL', usedSeconds: 90 * 60 }))).toBe('FULL')
      expect(bucketOf(account('a', { usedSeconds: 90 * 60 }))).toBe('FULL')
      expect(bucketOf(account('a', { usedSeconds: 80 * 60 }))).toBe('NEAR_FULL')
      expect(bucketOf(account('a', { usedSeconds: 0, idleWorkingDays: 3 }))).toBe('IDLE')
      expect(bucketOf(account('a'))).toBe('OK')
   })

   it('should not call an account idle when it browsed today', () => {
      expect(bucketOf(account('a', { usedSeconds: 10 * 60, idleWorkingDays: 3 }))).toBe('OK')
   })
})

describe('the overview', () => {
   const list = [
      account('full', { state: 'DAY_FULL', usedSeconds: 90 * 60 }),
      account('near', { usedSeconds: 80 * 60 }),
      account('idle', { usedSeconds: 0, idleWorkingDays: 4 }),
      account('paused', { state: 'NOT_BROWSING', usedSeconds: 0 }),
      account('fine'),
   ]

   it('should count each bucket', () => {
      expect(countBuckets(list)).toEqual({
         FULL: 1,
         NEAR_FULL: 1,
         IDLE: 1,
         NOT_BROWSING: 1,
         OK: 1,
      })
   })

   it('should name the accounts that went over their limit on 3 or more of the last 14 days', () => {
      expect(
         needAttention([account('a', { overLimitDays14: 3 }), account('b', { overLimitDays14: 2 })]).map(
            ({ accountId }) => accountId
         )
      ).toEqual(['a'])
   })
})
