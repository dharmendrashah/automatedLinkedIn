import { z } from 'zod'

import { LinkedInPostService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, listInput, readLinks } from '../linkedInRecord'

const postStatus = z.enum(['UNPROCESSED', 'PROCESSED'])

// Posts have no tags and their own statuses.
const postListInput = listInput
   .omit({
      status: true,
      tag: true,
   })
   .extend({ status: postStatus.optional() })

const updateInput = z.object({
   id: z.string().min(1),
   status: postStatus,
})

const NOUN = 'post'

// Every procedure scopes to ctx.user.id, so one user can never reach another's posts by id.
export const linkedInPost = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = readLinks(input.urls, 'post')
      const saved = await LinkedInPostService.addMany(ctx.user.id, links)

      return {
         ...saved,
         invalid,
      }
   }),

   list: ownerProcedure.input(postListInput).query(({ ctx, input }) => LinkedInPostService.list(ctx.user.id, input)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInPostService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure
      .input(updateInput)
      .mutation(async ({ ctx, input }) =>
         found(await LinkedInPostService.setStatus(ctx.user.id, input.id, input.status), NOUN)
      ),

   archive: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInPostService.archiveForUser(ctx.user.id, input.id), NOUN)),

   restore: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInPostService.restoreForUser(ctx.user.id, input.id), NOUN)),
})
