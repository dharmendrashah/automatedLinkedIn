import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { TooManyProfileUrlsError, parseProfileUrls } from 'core'

import { LinkedInProfileService } from 'database'

import { ownerProcedure, router } from 'trpc'

const byId = z.object({ id: z.string().min(1) })
const status = z.enum(['NEW', 'CONTACTED', 'REPLIED'])

// Optional text; an empty value clears the field.
const text = (max: number) =>
   z
      .string()
      .trim()
      .max(max)
      .transform(value => value || null)

const tag = z.string().trim().toLowerCase().min(1).max(30)
const tags = z
   .array(tag)
   .max(10)
   .transform(values => [...new Set(values)])

const createInput = z.object({ urls: z.string().trim().min(1).max(50_000) })

const listInput = z.object({
   search: z.string().trim().max(100).optional(),
   status: status.optional(),
   tag: tag.optional(),
   includeArchived: z.boolean().optional(),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(25),
})

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

// A foreign profile id is answered exactly like a missing one.
const found = <T>(profile: T | null) => {
   if (!profile) {
      throw new TRPCError({
         code: 'NOT_FOUND',
         message: 'LinkedIn profile not found',
      })
   }

   return profile
}

// Every procedure scopes to ctx.user.id, so one user can never reach another's profiles by id.
export const linkedInProfile = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      try {
         const { profiles, invalid } = parseProfileUrls(input.urls)
         const saved = await LinkedInProfileService.addMany(ctx.user.id, profiles)

         return {
            ...saved,
            invalid,
         }
      } catch (error) {
         if (error instanceof TooManyProfileUrlsError) {
            throw new TRPCError({
               code: 'BAD_REQUEST',
               message: error.message,
            })
         }

         throw error
      }
   }),

   list: ownerProcedure.input(listInput).query(({ ctx, input }) => LinkedInProfileService.list(ctx.user.id, input)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInProfileService.getForUser(ctx.user.id, input.id))),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInProfileService.updateForUser(ctx.user.id, id, changes))
   }),

   archive: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInProfileService.archiveForUser(ctx.user.id, input.id))),

   restore: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) => found(await LinkedInProfileService.restoreForUser(ctx.user.id, input.id))),
})
