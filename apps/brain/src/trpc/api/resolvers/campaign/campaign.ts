import { z } from 'zod'

import {
   AutomationService,
   CampaignListService,
   CampaignService,
   CampaignStarterService,
   CampaignStatsService,
   CampaignTrendService,
   FleetHealthService,
} from 'database'

import {
   AUTOMATIONS,
   type AutomationId,
   CAMPAIGN_PERIODS,
   CAMPAIGN_STAGES,
   CAMPAIGN_TREND_PERIODS,
   automationAnswersSchema,
   campaignInputSchema,
   isAutomationId,
   outreachAnswersSchema,
} from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Campaign not found'
const id = z.string().min(1).max(100)

// Campaigns and the page that reads them (.plan/lead-pipeline-p5-campaign-page.md). Every procedure is scoped to ctx.user.id, so a
// foreign id is answered as a missing one.
export const campaign = router({
   list: ownerProcedure.query(({ ctx }) => CampaignListService.list(ctx.user.id)),

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

   // Trend, gate, capacity and projection for the campaign page; Today shows the live funnel only, so it is not offered here.
   insights: ownerProcedure
      .input(
         z.object({
            id,
            period: z.enum(CAMPAIGN_TREND_PERIODS).default('7d'),
         })
      )
      .query(async ({ ctx, input }) =>
         present(await CampaignTrendService.insights(ctx.user.id, input.id, input.period), MISSING)
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

   // The Starter: one form makes the campaign and its six workflows, switched off (.plan/lead-pipeline-p6-campaign-starter.md).
   createOutreach: ownerProcedure
      .input(outreachAnswersSchema)
      .mutation(({ ctx, input }) => orConflict(CampaignStarterService.createOutreach(ctx.user.id, input))),

   // The sixteen automations and what each still waits for (.plan/lead-pipeline-p10-automations.md).
   automations: ownerProcedure.query(() => AUTOMATIONS),

   // One form makes the workflows of one automation, switched off.
   createAutomation: ownerProcedure
      .input(
         z.object({
            id: z.custom<AutomationId>(
               value => typeof value === 'string' && isAutomationId(value),
               'Unknown automation'
            ),
            answers: automationAnswersSchema,
         })
      )
      .mutation(({ ctx, input }) => orConflict(AutomationService.create(ctx.user.id, input.id, input.answers))),
})
