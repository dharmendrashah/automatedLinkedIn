import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { JobMonitorService, PlatformSettingService } from 'database'

import { adminProcedure, router } from 'trpc'

// The admin's cron monitor (.plan/cron-monitor.md): what the brain worker's jobs did and whether they ran on time. Read only.
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

   // The switch that stops every reaction and comment (.plan/lead-pipeline-p3-engage.md, P8), with who changed it and when.
   acts: adminProcedure.query(() => PlatformSettingService.actsSwitch()),

   setActs: adminProcedure
      .input(z.object({ on: z.boolean() }))
      .mutation(({ ctx, input }) => PlatformSettingService.setActs(input.on, ctx.user.email)),

   // The switch and the caps of With AI (.plan/lead-pipeline-p4-ai-drafts.md).
   ai: adminProcedure.query(() => PlatformSettingService.ai()),

   setAi: adminProcedure
      .input(z.object({ on: z.boolean() }))
      .mutation(({ ctx, input }) => PlatformSettingService.setAi(input, ctx.user.email)),
})
