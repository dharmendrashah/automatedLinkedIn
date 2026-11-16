import { TRPCError } from '@trpc/server'
import { describe, expect, it, vi } from 'vitest'

import { INTERNAL_MESSAGE, errorShape } from './errorShape'

const mocks = vi.hoisted(() => {
   class BrowseBudgetError extends Error {}

   return { BrowseBudgetError }
})

vi.mock('database', () => ({ BrowseBudgetError: mocks.BrowseBudgetError }))

const shape = {
   message: 'x',
   code: -32003,
   data: {
      code: 'PRECONDITION_FAILED',
      httpStatus: 412,
   },
}

describe('errorShape', () => {
   it('says when the account may not browse now, and not for any other error', () => {
      const budget = new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: 'resting',
         cause: new mocks.BrowseBudgetError('resting'),
      })
      const other = new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: 'no',
         cause: new Error('no'),
      })

      expect(
         errorShape({
            shape,
            error: budget,
         }).data
      ).toMatchObject({
         budgetRefusal: true,
         code: 'PRECONDITION_FAILED',
      })
      expect(
         errorShape({
            shape,
            error: other,
         }).data.budgetRefusal
      ).toBe(false)
   })

   it('replaces the text of an error tRPC wrapped itself, and keeps every deliberate message', () => {
      const wrapped = new TRPCError({
         code: 'INTERNAL_SERVER_ERROR',
         message: 'relation "Person" does not exist',
         cause: new Error('relation "Person" does not exist'),
      })
      const deliberate = new TRPCError({
         code: 'INTERNAL_SERVER_ERROR',
         message: 'Our own sentence',
      })
      const client = new TRPCError({
         code: 'BAD_REQUEST',
         message: 'Name is too long',
         cause: new Error('zod'),
      })

      const messageOf = (error: TRPCError) =>
         errorShape({
            shape: {
               ...shape,
               message: error.message,
            },
            error,
         }).message

      expect(messageOf(wrapped)).toBe(INTERNAL_MESSAGE)
      expect(messageOf(deliberate)).toBe('Our own sentence')
      expect(messageOf(client)).toBe('Name is too long')
   })
})
