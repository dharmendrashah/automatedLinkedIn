import { describe, expect, it } from 'vitest'

import { type AccountBrowse } from '../browsing/types'

import { hoursNowText, rankOf, verdictOf, whyText } from './verdict'

const hours = {
   days: [1, 2, 3, 4, 5],
   startMinute: 540,
   endMinute: 1080,
   timeZone: 'UTC',
}

const browse = (patch: Partial<AccountBrowse> = {}): AccountBrowse => ({
   accountId: 'a',
   email: 'a@example.com',
   clientLabel: null,
   mode: 'SAFE',
   usedSeconds: 20 * 60,
   state: 'OPEN',
   nextAt: null,
   hours,
   proxyTimeZone: 'UTC',
   last30: [],
   idleWorkingDays: 0,
   overLimitDays14: 0,
   viewsLeft: 5,
   ...patch,
})

describe('verdictOf', () => {
   it('should say paused or needs you from the status before it looks at browsing', () => {
      expect(verdictOf({ status: 'DISABLED' }, browse())).toBe('PAUSED')

      for (const status of ['PENDING', 'NEEDS_REAUTH', 'ERROR', 'BLOCKED'] as const) {
         expect(verdictOf({ status }, browse())).toBe('NEEDS_YOU')
      }
   })

   it('should read an active account from its browsing state', () => {
      expect(verdictOf({ status: 'ACTIVE' }, browse())).toBe('READY')
      expect(verdictOf({ status: 'ACTIVE' }, browse({ state: 'WAITING_FOR_SLOT', nextAt: '14:20' }))).toBe('WAITING')
      expect(verdictOf({ status: 'ACTIVE' }, browse({ state: 'OUTSIDE_HOURS', nextAt: 'tomorrow' }))).toBe(
         'OUTSIDE_HOURS'
      )
      expect(verdictOf({ status: 'ACTIVE' }, browse({ state: 'DAY_FULL', usedSeconds: 90 * 60 }))).toBe('FULL')
      expect(verdictOf({ status: 'ACTIVE' }, browse({ usedSeconds: 95 * 60 }))).toBe('FULL')
      expect(verdictOf({ status: 'ACTIVE' }, browse({ state: 'NOT_BROWSING' }))).toBe('NEEDS_YOU')
   })

   it('should claim nothing for an active account without browsing data', () => {
      expect(verdictOf({ status: 'ACTIVE' }, undefined)).toBe('SIGNED_IN')
   })
})

describe('whyText', () => {
   it('should say what a status means for the visits, and what an open account can do', () => {
      expect(whyText({ status: 'ERROR' }, browse())).toBe('Sign-in check failed. Visits are on hold.')
      expect(whyText({ status: 'DISABLED' }, browse())).toMatch(/Paused/)
      expect(whyText({ status: 'ACTIVE' }, browse())).toBe('Open. A session can start now.')
      expect(whyText({ status: 'ACTIVE' }, undefined)).toBe('Signed in.')
   })
})

describe('hoursNowText', () => {
   it('should say whether the account is inside its working hours, and when they open', () => {
      expect(hoursNowText(undefined)).toBe('—')
      expect(hoursNowText(browse({ state: 'NOT_BROWSING' }))).toBe('—')
      expect(hoursNowText(browse())).toBe('Inside hours')
      expect(hoursNowText(browse({ state: 'OUTSIDE_HOURS', nextAt: 'tomorrow at 09:00' }))).toBe(
         'Opens tomorrow at 09:00'
      )
   })
})

describe('rankOf', () => {
   it('should rank the urgent accounts first and paused ones last', () => {
      const near = browse({ usedSeconds: 80 * 60 })
      const order = [
         rankOf('NEEDS_YOU', undefined),
         rankOf('FULL', browse()),
         rankOf('READY', near),
         rankOf('OUTSIDE_HOURS', browse()),
         rankOf('WAITING', browse()),
         rankOf('READY', browse()),
         rankOf('PAUSED', undefined),
      ]

      expect(order).toEqual([...order].sort((a, b) => a - b))
      expect(new Set(order).size).toBe(order.length)
   })
})
