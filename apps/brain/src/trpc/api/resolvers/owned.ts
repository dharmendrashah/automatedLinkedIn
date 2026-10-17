import { TRPCError } from '@trpc/server'

import { ConflictError } from 'database'

// Answers shared by the lists and ideal customers routers.

export const orConflict = async <T>(work: Promise<T>) => {
   try {
      return await work
   } catch (error) {
      if (error instanceof ConflictError) {
         throw new TRPCError({
            code: 'CONFLICT',
            message: error.message,
         })
      }

      throw error
   }
}

// A foreign id is answered exactly like a missing one.
export const present = <T>(value: T | null | false, message: string): T => {
   if (value === null || value === false) {
      throw new TRPCError({
         code: 'NOT_FOUND',
         message,
      })
   }

   return value
}
