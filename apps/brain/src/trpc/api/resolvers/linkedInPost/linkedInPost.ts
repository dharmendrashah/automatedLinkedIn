import { z } from 'zod'

import { expandShortPostLink, isShortPostLink } from 'core'

import { LinkedInPostService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, ids, labelInput, listInput, readLinks, tags } from '../linkedInRecord'

const postStatus = z.enum(['UNPROCESSED', 'PROCESSED'])

// Posts have their own statuses.
const postListInput = listInput.omit({ status: true }).extend({ status: postStatus.optional() })

const updateInput = z.object({
   id: z.string().min(1),
   status: postStatus.optional(),
   tags: tags.optional(),
})

const NOUN = 'post'

// Every procedure scopes to ctx.user.id, so one user can never reach another's posts by id.
export const linkedInPost = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = readLinks(input.urls, 'post')
      // A failed expansion is retried by the worker before the post is sent anywhere.
      const expanded = await Promise.all(
         links.map(async link => ({
            ...link,
            expandedUrl: isShortPostLink(link.url) ? await expandShortPostLink(link.url) : null,
         }))
      )
      const saved = await LinkedInPostService.addMany(ctx.user.id, expanded, input.labels)

      return {
         ...saved,
         invalid,
      }
   }),

   list: ownerProcedure.input(postListInput).query(({ ctx, input }) => LinkedInPostService.list(ctx.user.id, input)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInPostService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInPostService.updateForUser(ctx.user.id, id, changes), NOUN)
   }),

   archive: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInPostService.archiveForUser(ctx.user.id, input.id), NOUN)),

   restore: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInPostService.restoreForUser(ctx.user.id, input.id), NOUN)),

   labelMany: ownerProcedure
      .input(labelInput)
      .mutation(({ ctx, input }) => LinkedInPostService.labelMany(ctx.user.id, { id: { in: input.ids } }, input)),

   archiveMany: ownerProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => {
      const archived = await LinkedInPostService.archiveMany(ctx.user.id, input.ids)

      return { archived }
   }),
})
