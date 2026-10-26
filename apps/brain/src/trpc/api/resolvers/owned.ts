import { TRPCError } from '@trpc/server'

import { ConflictError, TaskRefusedError } from 'database'

// Answers shared by the lists and ideal customers routers.

// A refusal brain wrote as a sentence for the owner (the limits, a type, an account that is busy) is a precondition that failed.
export const orRefused = async <T>(work: Promise<T>) => {
   try {
      return await work
   } catch (error) {
      if (error instanceof TaskRefusedError) {
         throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: error.message,
         })
      }

      throw error
   }
}

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
