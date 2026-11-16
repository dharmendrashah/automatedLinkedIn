import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { onError } from './onError'

const mocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('core/log', () => ({ log: { error: mocks.error } }))

describe('onError', () => {
   beforeEach(() => {
      mocks.error.mockClear()
   })

   it('logs the cause of an error tRPC wrapped itself, once', () => {
      const cause = new Error('connection refused')

      onError({
         error: new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            cause,
         }),
         path: 'person.list',
         type: 'query',
      })

      expect(mocks.error).toHaveBeenCalledTimes(1)
      expect(mocks.error).toHaveBeenCalledWith('Unhandled tRPC error', {
         path: 'person.list',
         type: 'query',
         error: cause,
      })
   })

   it('does not log an error the resolver already logged', () => {
      onError({
         error: new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Something went wrong.',
         }),
         path: 'person.list',
         type: 'query',
      })

      expect(mocks.error).not.toHaveBeenCalled()
   })

   it('does not log errors the caller caused', () => {
      for (const code of ['CONFLICT', 'NOT_FOUND', 'UNAUTHORIZED'] as const) {
         onError({
            error: new TRPCError({
               code,
               cause: new Error(code),
            }),
            path: 'person.list',
            type: 'query',
         })
      }

      expect(mocks.error).not.toHaveBeenCalled()
   })
})
