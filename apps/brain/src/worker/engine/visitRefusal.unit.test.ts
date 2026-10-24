import { describe, expect, it, vi } from 'vitest'

import { refusalOf } from './visitRefusal'

const mocks = vi.hoisted(() => {
   class TaskRefusedError extends Error {}
   class TaskUnavailableError extends TaskRefusedError {}
   class TaskNeedsProxyError extends TaskRefusedError {}
   class AccountNotReadyError extends TaskRefusedError {}
   class TaskBusyError extends TaskRefusedError {}
   class TaskRecentError extends TaskRefusedError {}
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
