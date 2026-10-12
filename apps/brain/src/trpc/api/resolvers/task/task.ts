import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { ProxyServerOwnershipError, TaskOwnershipError, TaskRefusedError, TaskService } from 'database'

import { TASK_NAME_PATTERN } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

const MAX_INPUT_BYTES = 8 * 1024

const runInput = z.object({
   task: z.string().regex(TASK_NAME_PATTERN),
   proxyId: z.string().min(1).max(100).optional(),
   accountId: z.string().min(1).max(100).optional(),
   // Task specific and never read by brain: the spider validates it.
   input: z
      .record(z.string(), z.unknown())
      .refine(value => JSON.stringify(value).length <= MAX_INPUT_BYTES, { message: 'The input is too large.' })
      .optional(),
})

// What is safe to say to the browser. Anything unexpected is logged here and reported without its details.
const asTrpcError = (error: unknown) => {
   if (error instanceof ProxyServerOwnershipError || error instanceof TaskOwnershipError) {
      return new TRPCError({
         code: 'NOT_FOUND',
         message: error.message,
      })
   }

   if (error instanceof TaskRefusedError) {
      return new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: error.message,
      })
   }

   console.error(`Tasks: ${(error as Error).message}`)

   return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Try again in a moment.',
   })
}

// Every task goes through these two procedures; a new task needs nothing here. Everything is scoped to ctx.user.id.
export const task = router({
   // The tasks the worker announced: titles, verdict labels and what each one needs.
   catalog: ownerProcedure.query(() => TaskService.catalog()),

   run: ownerProcedure.input(runInput).mutation(async ({ ctx, input }) => {
      try {
         return await TaskService.request({
            userId: ctx.user.id,
            task: input.task,
            proxyId: input.proxyId,
            accountId: input.accountId,
            input: input.input,
            trigger: 'manual',
         })
      } catch (error) {
         throw asTrpcError(error)
      }
   }),
})
