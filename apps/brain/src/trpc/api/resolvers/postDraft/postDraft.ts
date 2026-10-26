import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { PostDraftService } from 'database'

import { postDraftInputSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const byId = z.object({ id: z.string().min(1).max(64) })

// The posts the owner is writing. Every call is scoped to ctx.user.id; a foreign id answers exactly like a missing one.
export const postDraft = router({
   list: ownerProcedure.query(({ ctx }) => PostDraftService.list(ctx.user.id)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => present(await PostDraftService.get(ctx.user.id, input.id), 'Draft not found')),

   save: ownerProcedure.input(postDraftInputSchema).mutation(async ({ ctx, input }) => {
      const saved = await orConflict(PostDraftService.save(ctx.user.id, input))

      if (!saved) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: input.id ? 'Draft or LinkedIn account not found' : 'LinkedIn account not found',
         })
      }

      return saved
   }),

   remove: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => ({ removed: await PostDraftService.remove(ctx.user.id, input.id) })),
})
