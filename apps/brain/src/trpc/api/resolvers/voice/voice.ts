import { z } from 'zod'

import { VoiceService } from 'database'

import { voiceSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Voice not found'

// How the owner's words sound (.plan/lead-pipeline-p4-ai-drafts.md). Every procedure is scoped to ctx.user.id.
export const voice = router({
   list: ownerProcedure.query(({ ctx }) => VoiceService.list(ctx.user.id)),

   save: ownerProcedure
      .input(voiceSchema.extend({ id: z.string().min(1).max(100).optional() }))
      .mutation(async ({ ctx, input }) => {
         const { id, ...fields } = input

         return present(await orConflict(VoiceService.save(ctx.user.id, fields, id)), MISSING)
      }),

   remove: ownerProcedure.input(z.object({ id: z.string().min(1).max(100) })).mutation(async ({ ctx, input }) => {
      present(await VoiceService.remove(ctx.user.id, input.id), MISSING)
   }),
})
