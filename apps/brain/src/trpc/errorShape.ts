import { type TRPCError } from '@trpc/server'

import { BrowseBudgetError } from 'database'

// What the browser is told of an error besides its code and message: whether the account may not browse now (its rest between two
// sessions, its hours, its day), so the page can offer to start anyway instead of matching on the sentence.
export const errorShape = <Shape extends { data: object }>({ shape, error }: { shape: Shape; error: TRPCError }) => ({
   ...shape,
   data: {
      ...shape.data,
      budgetRefusal: error.cause instanceof BrowseBudgetError,
   },
})
