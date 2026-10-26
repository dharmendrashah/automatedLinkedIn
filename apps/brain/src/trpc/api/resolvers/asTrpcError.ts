import { TRPCError } from '@trpc/server'

import { ProxyServerOwnershipError, TaskOwnershipError, TaskRecentError, TaskRefusedError } from 'database'

// What is safe to say to the browser when a task could not be requested. Anything unexpected is logged here and reported without
// its details.
export const asTrpcError = (error: unknown) => {
   if (error instanceof ProxyServerOwnershipError || error instanceof TaskOwnershipError) {
      return new TRPCError({
         code: 'NOT_FOUND',
         message: error.message,
      })
   }

   if (error instanceof TaskRecentError) {
      return new TRPCError({
         code: 'CONFLICT',
         message: error.message,
      })
   }

   if (error instanceof TaskRefusedError) {
      return new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: error.message,
         cause: error,
      })
   }

   console.error(`Tasks: ${(error as Error).message}`)

   return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Try again in a moment.',
   })
}
