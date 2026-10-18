import { z } from 'zod'

import { LinkedInProfileService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, ids, labelInput, listInput, readLinks, status, tags, text } from '../linkedInRecord'

const updateInput = z.object({
   id: z.string().min(1),
   fullName: text(200).nullish(),
   headline: text(300).nullish(),
   company: text(200).nullish(),
   location: text(200).nullish(),
   notes: text(5000).nullish(),
   tags: tags.optional(),
   status: status.optional(),
})

const NOUN = 'profile'

// Every procedure scopes to ctx.user.id, so one user can never reach another's profiles by id.
export const linkedInProfile = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = readLinks(input.urls, 'profile')
      const saved = await LinkedInProfileService.addMany(ctx.user.id, links, input.labels)

      return {
         ...saved,
         invalid,
      }
   }),

   list: ownerProcedure.input(listInput).query(({ ctx, input }) => LinkedInProfileService.list(ctx.user.id, input)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInProfileService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInProfileService.updateForUser(ctx.user.id, id, changes), NOUN)
   }),

   archive: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         found(await LinkedInProfileService.archiveForUser(ctx.user.id, input.id), NOUN)
      ),

   restore: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         found(await LinkedInProfileService.restoreForUser(ctx.user.id, input.id), NOUN)
      ),

   labelMany: ownerProcedure
      .input(labelInput)
      .mutation(({ ctx, input }) => LinkedInProfileService.labelMany(ctx.user.id, { id: { in: input.ids } }, input)),

   archiveMany: ownerProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => {
      const archived = await LinkedInProfileService.archiveMany(ctx.user.id, input.ids)

      return { archived }
   }),
})
