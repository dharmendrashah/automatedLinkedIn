import { z } from 'zod'

import { CampaignService, CampaignStatsService, FleetHealthService } from 'database'

import { CAMPAIGN_PERIODS, CAMPAIGN_STAGES, campaignInputSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Campaign not found'
const id = z.string().min(1).max(100)

// Campaigns and the page that reads them (.plan/lead-pipeline-p5-campaign-page.md). Every procedure is scoped to ctx.user.id, so a
// foreign id is answered as a missing one.
export const campaign = router({
   list: ownerProcedure.query(({ ctx }) => CampaignService.list(ctx.user.id)),

   create: ownerProcedure
      .input(campaignInputSchema)
      .mutation(({ ctx, input }) => orConflict(CampaignService.create(ctx.user.id, input))),

   remove: ownerProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
      present(await CampaignService.remove(ctx.user.id, input.id), MISSING)
   }),

   overview: ownerProcedure
      .input(
         z.object({
            id,
            period: z.enum(CAMPAIGN_PERIODS).default('7d'),
         })
      )
      .query(async ({ ctx, input }) =>
         present(await CampaignStatsService.overview(ctx.user.id, input.id, input.period), MISSING)
      ),

   // Puts a workflow in a campaign (or in none) at a stage.
   place: ownerProcedure
      .input(
         z.object({
            workflowId: id,
            campaignId: id.nullable(),
            stage: z.enum(CAMPAIGN_STAGES),
         })
      )
      .mutation(async ({ ctx, input }) => {
         present(
            await CampaignService.place(ctx.user.id, input.workflowId, input.campaignId, input.stage),
            'Workflow or campaign not found'
         )
      }),

   pause: ownerProcedure
      .input(
         z.object({
            id,
            stopQueued: z.boolean().default(false),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(CampaignService.pause(ctx.user.id, input.id, input.stopQueued)), MISSING)
      ),

   resume: ownerProcedure
      .input(z.object({ id }))
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(CampaignService.resume(ctx.user.id, input.id)), MISSING)
      ),

   // How each account is doing, for the strip and the account drawers.
   fleet: ownerProcedure.query(({ ctx }) => FleetHealthService.forUser(ctx.user.id)),
})
