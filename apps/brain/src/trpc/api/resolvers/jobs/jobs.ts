import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { JobMonitorService, PlatformSettingService } from 'database'

import { adminProcedure, router } from 'trpc'

// The admin's cron monitor: what the brain worker's scheduled jobs did on each run, and whether they ran on time.
// Read-only, and restricted to the platform admin account.
export const jobs = router({
   overview: adminProcedure.query(() => JobMonitorService.overview()),

   runs: adminProcedure
      .input(
         z.object({
            job: z.string().min(1).max(100),
            includeIdle: z.boolean().default(false),
            before: z.string().datetime().optional(),
            limit: z.number().int().min(1).max(100).default(50),
         })
      )
      .query(({ input }) =>
         JobMonitorService.runs({
            job: input.job,
            includeIdle: input.includeIdle,
            before: input.before ? new Date(input.before) : undefined,
            limit: input.limit,
         })
      ),

   run: adminProcedure.input(z.object({ id: z.string().min(1).max(100) })).query(async ({ input }) => {
      const run = await JobMonitorService.run(input.id)

      if (!run) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'That run was not found',
         })
      }

      return run
   }),

   messageReads: adminProcedure.query(() => JobMonitorService.messageReads()),

   // The platform-wide switch that turns off every automated reaction and comment ("Acts"), with who last changed it
   // and when.
   acts: adminProcedure.query(() => PlatformSettingService.actsSwitch()),

   setActs: adminProcedure
      .input(z.object({ on: z.boolean() }))
      .mutation(({ ctx, input }) => PlatformSettingService.setActs(input.on, ctx.user.email)),

   // The platform-wide switch and usage caps for "With AI" (AI-drafted comments and replies).
   ai: adminProcedure.query(() => PlatformSettingService.ai()),

   setAi: adminProcedure
      .input(z.object({ on: z.boolean() }))
      .mutation(({ ctx, input }) => PlatformSettingService.setAi(input, ctx.user.email)),
})
