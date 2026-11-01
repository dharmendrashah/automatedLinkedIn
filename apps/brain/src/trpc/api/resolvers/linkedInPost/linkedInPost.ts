import { z } from 'zod'

import { expandShortPostLink, isShortPostLink } from 'core'

import { IMPORT_BATCH, IMPORT_CAP, LinkedInPostService, POST_SORTS, PostPageService, importedOf } from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, ids, labelInput, listInput, readLinks, tags } from '../linkedInRecord'

const postStatus = z.enum(['UNPROCESSED', 'PROCESSED'])

// Posts have their own statuses and are never archived (.plan/posts-page-redesign.md).
const postListInput = listInput
   .omit({
      status: true,
      includeArchived: true,
   })
   .extend({
      status: postStatus.optional(),
      read: z.enum(['READ', 'UNREAD']).optional(),
      cursor: z.number().int().min(1).nullish(),
      sort: z
         .object({
            by: z.enum(POST_SORTS),
            desc: z.boolean(),
         })
         .optional(),
   })

const updateInput = z.object({
   id: z.string().min(1),
   status: postStatus.optional(),
   tags: tags.optional(),
})

const postUrl = z.string().trim().min(1).max(500)

// The import of pasted links or a CSV, sent in batches. `read`: none, only the new posts, or all; a read in the last 30 days is skipped.
const importInput = z.object({
   posts: z
      .array(
         z.object({
            url: postUrl,
            labels: tags.optional(),
         })
      )
      .min(1)
      .max(IMPORT_BATCH),
   labels: tags.default([]),
   read: z.enum(['NONE', 'NEW', 'ALL']).default('NONE'),
})

const NO_READS = {
   reading: 0,
   readRecently: 0,
   paused: 0,
}

const NOUN = 'post'

// A short link is saved with the post it redirects to; a failed expansion is retried by the worker before the post is sent anywhere.
const withExpanded = <L extends { url: string }>(links: L[]) =>
   Promise.all(
      links.map(async link => ({
         ...link,
         expandedUrl: isShortPostLink(link.url) ? await expandShortPostLink(link.url) : null,
      }))
   )

// Every procedure scopes to ctx.user.id, so one user can never reach another's posts by id.
export const linkedInPost = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = readLinks(input.urls, 'post')
      const saved = await LinkedInPostService.addMany(ctx.user.id, await withExpanded(links), input.labels)

      return {
         ...saved,
         invalid,
      }
   }),

   // What an import would do with each link (read only; a mutation so up to IMPORT_CAP links fit in the request).
   preview: ownerProcedure
      .input(z.object({ urls: z.array(postUrl).min(1).max(IMPORT_CAP) }))
      .mutation(async ({ ctx, input }) => {
         const { links, invalid } = importedOf(
            input.urls.map(url => ({ url })),
            'post'
         )
         const posts = await LinkedInPostService.preview(ctx.user.id, links)
         const recent = await PostPageService.readRecently(
            ctx.user.id,
            posts.map(({ slug }) => slug)
         )

         return {
            posts: posts.map(post => ({
               ...post,
               readRecently: recent.has(post.slug),
            })),
            invalid,
         }
      }),

   import: ownerProcedure.input(importInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = importedOf(input.posts, 'post')
      const { slugs, fresh, ...saved } = await LinkedInPostService.importMany(
         ctx.user.id,
         await withExpanded(links),
         input.labels
      )
      const toRead = input.read === 'ALL' ? slugs : input.read === 'NEW' ? fresh : []
      const reads =
         toRead.length === 0 ? NO_READS : await PostPageService.readMany(ctx.user.id, { slug: { in: toRead } })

      return {
         ...saved,
         invalid: invalid.length,
         ...reads,
      }
   }),

   // One paid read each for the picked posts; a read in the last 30 days is skipped.
   readMany: ownerProcedure
      .input(z.object({ ids }))
      .mutation(({ ctx, input }) => PostPageService.readMany(ctx.user.id, { id: { in: input.ids } })),

   // `cursor` is the page a scrolling table asks for next (TanStack infinite query); `nextCursor` is unset at the end.
   list: ownerProcedure.input(postListInput).query(async ({ ctx, input }) => {
      const { cursor, ...query } = input
      const page = cursor ?? query.page
      const result = await LinkedInPostService.list(ctx.user.id, {
         ...query,
         page,
      })

      return {
         ...result,
         nextCursor: page * query.pageSize < result.total ? page + 1 : undefined,
      }
   }),

   summary: ownerProcedure.query(({ ctx }) => LinkedInPostService.summary(ctx.user.id)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInPostService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInPostService.updateForUser(ctx.user.id, id, changes), NOUN)
   }),

   labelMany: ownerProcedure
      .input(labelInput)
      .mutation(({ ctx, input }) => LinkedInPostService.labelMany(ctx.user.id, { id: { in: input.ids } }, input)),

   // Marks the picked posts done or back to work.
   setStatusMany: ownerProcedure
      .input(
         z.object({
            ids,
            status: postStatus,
         })
      )
      .mutation(async ({ ctx, input }) => {
         const changed = await LinkedInPostService.setStatusMany(ctx.user.id, input.ids, input.status)

         return { changed }
      }),
})
