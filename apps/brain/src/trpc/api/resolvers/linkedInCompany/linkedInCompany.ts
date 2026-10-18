import { z } from 'zod'

import { LinkedInCompanyService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, ids, labelInput, listInput, readLinks, status, tags, text } from '../linkedInRecord'

const isHttpUrl = (value: string) => {
   try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
   } catch {
      return false
   }
}

// Only a web address that starts with http or https; an empty value clears the field.
const website = z
   .string()
   .trim()
   .max(300)
   .refine(value => value === '' || isHttpUrl(value), 'Enter a website that starts with http:// or https://')
   .transform(value => value || null)

const updateInput = z.object({
   id: z.string().min(1),
   name: text(200).nullish(),
   industry: text(200).nullish(),
   website: website.nullish(),
   size: text(50).nullish(),
   location: text(200).nullish(),
   notes: text(5000).nullish(),
   tags: tags.optional(),
   status: status.optional(),
})

const NOUN = 'company'

// Every procedure scopes to ctx.user.id, so one user can never reach another's companies by id.
export const linkedInCompany = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { links, invalid } = readLinks(input.urls, 'company')
      const saved = await LinkedInCompanyService.addMany(ctx.user.id, links, input.labels)

      return {
         ...saved,
         invalid,
      }
   }),

   list: ownerProcedure.input(listInput).query(({ ctx, input }) => LinkedInCompanyService.list(ctx.user.id, input)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInCompanyService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInCompanyService.updateForUser(ctx.user.id, id, changes), NOUN)
   }),

   archive: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         found(await LinkedInCompanyService.archiveForUser(ctx.user.id, input.id), NOUN)
      ),

   restore: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         found(await LinkedInCompanyService.restoreForUser(ctx.user.id, input.id), NOUN)
      ),

   labelMany: ownerProcedure
      .input(labelInput)
      .mutation(({ ctx, input }) => LinkedInCompanyService.labelMany(ctx.user.id, { id: { in: input.ids } }, input)),

   archiveMany: ownerProcedure.input(z.object({ ids })).mutation(async ({ ctx, input }) => {
      const archived = await LinkedInCompanyService.archiveMany(ctx.user.id, input.ids)

      return { archived }
   }),
})
