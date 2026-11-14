import { z } from 'zod'

import { PositiveReplyService } from 'database'

import { replyValueInputSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { present } from '../owned'

const id = z.string().min(1).max(100)

// Positive replies and the revenue pipeline (.plan/campaign-revenue-pipeline.md). Every procedure is scoped to ctx.user.id, so a foreign
// id is answered as a missing one.
export const positiveReply = router({
   // Every campaign with its positive replies, its worth per reply and its pipeline in USD a year.
   pipeline: ownerProcedure.query(({ ctx }) => PositiveReplyService.pipeline(ctx.user.id)),

   setValue: ownerProcedure
      .input(replyValueInputSchema)
      .mutation(async ({ ctx, input }) =>
         present(await PositiveReplyService.setReplyValue(ctx.user.id, input.id, input.valueUsd), 'Campaign not found')
      ),

   // What the Unibox shows for one conversation.
   forConversation: ownerProcedure
      .input(z.object({ conversationId: id }))
      .query(async ({ ctx, input }) =>
         present(
            await PositiveReplyService.forConversation(ctx.user.id, input.conversationId),
            'Conversation not found'
         )
      ),

   mark: ownerProcedure
      .input(
         z.object({
            conversationId: id,
            campaignId: id.nullable(),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(
            await PositiveReplyService.mark(ctx.user.id, input.conversationId, input.campaignId),
            'Conversation or campaign not found'
         )
      ),

   unmark: ownerProcedure
      .input(
         z.object({
            conversationId: id,
            campaignId: id.nullable(),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(
            await PositiveReplyService.unmark(ctx.user.id, input.conversationId, input.campaignId),
            'Conversation or campaign not found'
         )
      ),

   leads: ownerProcedure.query(({ ctx }) => PositiveReplyService.leads(ctx.user.id)),

   aiReads: ownerProcedure.query(({ ctx }) => PositiveReplyService.aiReads(ctx.user.id)),

   setAiReads: ownerProcedure
      .input(z.object({ on: z.boolean() }))
      .mutation(({ ctx, input }) => PositiveReplyService.setAiReads(ctx.user.id, input.on)),

   // The one-time read of existing conversations: counts the sure ones now and queues unclear ones for the AI.
   backfill: ownerProcedure.mutation(({ ctx }) => PositiveReplyService.backfill(ctx.user.id)),
})
