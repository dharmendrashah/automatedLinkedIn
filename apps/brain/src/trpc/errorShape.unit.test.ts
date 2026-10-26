import { TRPCError } from '@trpc/server'
import { describe, expect, it, vi } from 'vitest'

import { errorShape } from './errorShape'

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
})
