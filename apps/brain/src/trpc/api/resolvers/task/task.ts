import { z } from 'zod'

import { TaskService } from 'database'

import { RUNNER_VERDICTS, TASK_NAME_PATTERN } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'

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
   // The owner saw that it ran a moment ago and wants it again anyway.
   confirmed: z.boolean().optional(),
   // The owner was told the account may not browse now (its rest, hours or day) and starts it anyway.
   startAnyway: z.boolean().optional(),
})

// Every task goes through these two procedures; a new task needs nothing here. Everything is scoped to ctx.user.id.
export const task = router({
   // The tasks the worker announced (titles, verdict labels, what each one needs) and the labels of the answers the runner
   // gives when a task could not even start.
   catalog: ownerProcedure.query(async () => ({
      tasks: await TaskService.catalog(),
      runnerVerdicts: RUNNER_VERDICTS as Record<string, { label: string; tone: 'success' | 'failure' | 'neutral' }>,
   })),

   run: ownerProcedure.input(runInput).mutation(async ({ ctx, input }) => {
      try {
         return await TaskService.request({
            userId: ctx.user.id,
            task: input.task,
            proxyId: input.proxyId,
            accountId: input.accountId,
            input: input.input,
            confirmed: input.confirmed,
            startAnyway: input.startAnyway,
            trigger: 'manual',
         })
      } catch (error) {
         throw asTrpcError(error)
      }
   }),
})
