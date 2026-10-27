import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { PostPublicationService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { orConflict, orRefused, present } from '../owned'

const draftId = z.object({ draftId: z.string().min(1).max(64) })
const byId = z.object({ id: z.string().min(1).max(64) })

// The posts the owner sent for posting or planned (.plan/posting-send-task.md). Every call is scoped to ctx.user.id; a foreign id
// answers exactly like a missing one. Refused with a sentence when the limits, the account or the post itself do not allow it.
export const postPublication = router({
   list: ownerProcedure.query(({ ctx }) => PostPublicationService.list(ctx.user.id)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) =>
         present(await PostPublicationService.get(ctx.user.id, input.id), 'Post not found')
      ),

   // Posts the draft now: it is copied whole and the draft is gone. Answers at once; where the post is, the page polls.
   publish: ownerProcedure
      .input(draftId)
      .mutation(async ({ ctx, input }) =>
         present(await orRefused(PostPublicationService.publish(ctx.user.id, input.draftId)), 'Draft not found')
      ),

   // Plans the draft for the time it holds.
   schedule: ownerProcedure
      .input(draftId)
      .mutation(async ({ ctx, input }) =>
         present(await orRefused(PostPublicationService.schedule(ctx.user.id, input.draftId)), 'Draft not found')
      ),

   // Cancels a planned or queued post, or takes a failed or unsure one back to edit it: the draft is made again.
   backToDraft: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const draft = await orRefused(PostPublicationService.backToDraft(ctx.user.id, input.id))

      if (!draft) {
         throw new TRPCError({
            code: 'CONFLICT',
            message: 'This post cannot be taken back now.',
         })
      }

      return draft
   }),

   // A new draft of the same account with the words and settings of a post in any state; its files and time are not copied.
   duplicate: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         present(await orRefused(orConflict(PostPublicationService.duplicate(ctx.user.id, input.id))), 'Post not found')
      ),
})
