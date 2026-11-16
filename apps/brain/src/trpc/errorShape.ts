import { type TRPCError } from '@trpc/server'

import { BrowseBudgetError } from 'database'

// The sentence the browser gets for an error tRPC wrapped itself; the cause is logged by `onError`, never sent.
export const INTERNAL_MESSAGE = 'Something went wrong. Try again in a moment.'

// What the browser is told of an error besides its code and message: whether the account may not browse now (its rest between two
// sessions, its hours, its day), so the page can offer to start anyway instead of matching on the sentence.
export const errorShape = <Shape extends { data: object; message: string }>({
   shape,
   error,
}: {
   shape: Shape
   error: TRPCError
}) => ({
   ...shape,
   message: error.code === 'INTERNAL_SERVER_ERROR' && error.cause !== undefined ? INTERNAL_MESSAGE : shape.message,
   data: {
      ...shape.data,
      budgetRefusal: error.cause instanceof BrowseBudgetError,
   },
})
