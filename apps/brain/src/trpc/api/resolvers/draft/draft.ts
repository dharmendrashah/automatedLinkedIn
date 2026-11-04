import { z } from 'zod'

import { DraftService } from 'database'

import { DRAFT_KINDS, DRAFT_LIMITS, DRAFT_STATES } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

const kind = z.enum(DRAFT_KINDS)
const ids = z.array(z.string().min(1).max(100)).min(1).max(50)

// The inbox of words that wait for the owner (.plan/lead-pipeline-p4-ai-drafts.md). It only decides: approving never acts, the job
// `approval-start` goes on with what was approved. Every procedure is scoped to ctx.user.id, so a foreign id is answered as a missing one.
export const draft = router({
   list: ownerProcedure
      .input(
         z.object({
            state: z.enum(DRAFT_STATES).default('DRAFTED'),
            kind: kind.optional(),
            cursor: z.string().min(1).max(100).optional(),
            take: z.number().int().min(1).max(50).default(30),
         })
      )
      .query(({ ctx, input }) => DraftService.list(ctx.user.id, input)),

   // The badge, and how the owner has been deciding.
   counts: ownerProcedure.query(({ ctx }) => DraftService.counts(ctx.user.id)),

   // What an edit is checked against, so the page can show each check while the owner types.
   rules: ownerProcedure
      .input(z.object({ kind }))
      .query(({ ctx, input }) => DraftService.rules(ctx.user.id, input.kind)),

   approve: ownerProcedure
      .input(
         z.object({
            items: z
               .array(
                  z.object({
                     id: z.string().min(1).max(100),
                     words: z.string().max(DRAFT_LIMITS.commentChars).optional(),
                  })
               )
               .min(1)
               .max(50),
         })
      )
      .mutation(({ ctx, input }) => DraftService.approve(ctx.user.id, input.items)),

   reject: ownerProcedure
      .input(
         z.object({
            ids,
            reason: z.enum(['OFF_TOPIC', 'TOO_GENERIC', 'WRONG_TONE', 'SENSITIVE', 'OTHER']),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const rejected = await DraftService.reject(ctx.user.id, input.ids, input.reason)

         return { rejected }
      }),
})
