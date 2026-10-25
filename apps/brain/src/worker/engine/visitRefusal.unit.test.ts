import { describe, expect, it, vi } from 'vitest'

import { type Refusal, deferralOf, refusalOf } from './visitRefusal'

const mocks = vi.hoisted(() => {
   class TaskRefusedError extends Error {}
   class TaskUnavailableError extends TaskRefusedError {}
   class TaskNeedsProxyError extends TaskRefusedError {}
   class AccountNotReadyError extends TaskRefusedError {}
   class TaskBusyError extends TaskRefusedError {}
   class TaskRecentError extends TaskRefusedError {}
   class BrowseBudgetError extends TaskRefusedError {
      public constructor(
         message: string,
         public readonly reason: string,
         public readonly until: Date,
         public readonly when: string
      ) {
         super(message)
      }
   }
   class PageVisitRefusedError extends TaskRefusedError {
      public readonly reason: string

      public constructor(message: string, reason: string) {
         super(message)
         this.reason = reason
      }
   }

   return {
      TaskRefusedError,
      TaskUnavailableError,
      TaskNeedsProxyError,
      AccountNotReadyError,
      TaskBusyError,
      TaskRecentError,
      BrowseBudgetError,
      PageVisitRefusedError,
   }
})

vi.mock('database', () => mocks)

describe('refusalOf', () => {
   it('should call a busy account, the gap and the daily cap reasons to wait for', () => {
      expect(refusalOf(new mocks.TaskBusyError('x'))).toEqual({
         kind: 'later',
         text: 'an account is busy with another visit',
      })
      expect(refusalOf(new mocks.TaskRecentError('x'))).toEqual({
         kind: 'later',
         text: 'an account is in its 3 minute gap',
      })
      expect(refusalOf(new mocks.PageVisitRefusedError('x', 'CAP'))).toEqual({
         kind: 'later',
         text: 'an account reached its 15 visits a day',
      })
   })

   it('should call a task nobody announced, a missing proxy and an account not signed in blocked', () => {
      expect(refusalOf(new mocks.TaskUnavailableError('x'))).toEqual({
         kind: 'blocked',
         text: 'the browser worker has not announced this action yet; start or restart it',
      })
      expect(refusalOf(new mocks.TaskNeedsProxyError('x'))).toEqual({
         kind: 'blocked',
         text: 'an account has no working proxy',
      })
      expect(refusalOf(new mocks.AccountNotReadyError('x'))).toEqual({
         kind: 'blocked',
         text: 'an account is not signed in',
      })
   })

   it('should treat any other refusal as one to wait for, and say nothing about what is not a refusal', () => {
      expect(refusalOf(new mocks.TaskRefusedError('x'))).toEqual({
         kind: 'later',
         text: 'an account cannot act now',
      })
      expect(refusalOf(new Error('database down'))).toBeNull()
   })
})

describe('browsing time refusals', () => {
   const budget = (reason: string, until: string, when: string) =>
      new mocks.BrowseBudgetError('x', reason, new Date(until), when)

   it('should say why an account has no browsing time, and when it has again', () => {
      expect(refusalOf(budget('DAY_FULL', '2026-10-22T09:12:00Z', 'tomorrow at 09:12'))).toEqual({
         kind: 'later',
         text: 'an account has used its browsing time for today',
         until: new Date('2026-10-22T09:12:00Z'),
         when: 'tomorrow at 09:12',
      })
      const closed = refusalOf(budget('OUTSIDE_OFFICE', '2026-10-22T09:12:00Z', 'tomorrow at 09:12'))
      const resting = refusalOf(budget('GAP', '2026-10-21T12:10:00Z', 'at 12:10'))

      expect(closed?.text).toBe('an account is outside its working hours')
      expect(resting?.text).toBe('an account is resting between two sessions')
   })
})

describe('deferralOf', () => {
   const now = new Date('2026-10-21T18:30:00Z')
   const night = (until: string): Refusal => ({
      kind: 'later',
      text: 'an account has used its browsing time for today',
      until: new Date(until),
      when: 'tomorrow at 09:12',
   })

   it('should hold the block until the earliest time when every chosen account is out of browsing time for hours', () => {
      const refused = new Map([
         ['a', night('2026-10-22T09:30:00Z')],
         ['b', night('2026-10-22T09:12:00Z')],
      ])

      expect(deferralOf(refused, ['a', 'b'], now)).toEqual({
         until: new Date('2026-10-22T09:12:00Z'),
         when: 'tomorrow at 09:12',
      })
   })

   it('should not hold the block while one account can still take a visit, or for a short wait', () => {
      expect(deferralOf(new Map([['a', night('2026-10-22T09:12:00Z')]]), ['a', 'b'], now)).toBeNull()
      expect(deferralOf(new Map([['a', night('2026-10-21T18:40:00Z')]]), ['a'], now)).toBeNull()
      expect(
         deferralOf(
            new Map([
               [
                  'a',
                  {
                     kind: 'later',
                     text: 'an account is busy with another visit',
                  },
               ],
            ]),
            ['a'],
            now
         )
      ).toBeNull()
   })
})
