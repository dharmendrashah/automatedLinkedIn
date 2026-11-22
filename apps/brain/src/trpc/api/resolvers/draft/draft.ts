import { z } from 'zod'

import { DraftService } from 'database'

import { DRAFT_KINDS, DRAFT_LIMITS, DRAFT_STATES } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

const kind = z.enum(DRAFT_KINDS)
const ids = z.array(z.string().min(1).max(100)).min(1).max(50)

// AI-drafted comments and replies waiting for the owner's decision. Approving a draft only records the decision
// here; it does not post or send anything by itself — a background job picks up approved drafts and acts on them
// separately. Every procedure is scoped to ctx.user.id, so a draft id that belongs to someone else is answered as
// not found.
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
