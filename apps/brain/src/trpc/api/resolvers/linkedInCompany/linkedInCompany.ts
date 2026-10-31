import { z } from 'zod'

import {
   CompanyViewService,
   IcpService,
   LinkedInCompanyService,
   READ_AGES,
   TEAM_KIND_NAMES,
   VISIT_AGES,
} from 'database'

import { ownerProcedure, router } from 'trpc'

import { byId, createInput, found, ids, labelInput, listInput, readLinks, status, tags, text } from '../linkedInRecord'
import { orConflict, present } from '../owned'
import { visitProcedure } from '../pageVisit'

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

const values = z.array(z.string().trim().min(1).max(200)).max(50).optional()
const range = z
   .object({
      min: z.number().int().min(0).max(10_000_000).optional(),
      max: z.number().int().min(0).max(10_000_000).optional(),
   })
   .optional()

// The Filters drawer (.plan/companies-filter-drawer.md).
const drawerInput = {
   icpId: z.string().min(1).optional(),
   icpIncludeUnread: z.boolean().optional(),
   sizes: values,
   founded: range,
   places: values,
   offices: values,
   categories: values,
   team: z
      .array(
         z.object({
            kind: z.enum(TEAM_KIND_NAMES),
            values: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
            min: z.number().int().min(1).max(100_000),
         })
      )
      .max(10)
      .optional(),
   specialities: values,
   words: z
      .object({
         values: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
         match: z.enum(['any', 'all']),
      })
      .optional(),
   read: z.enum(READ_AGES).optional(),
   visited: z.enum(VISIT_AGES).optional(),
   notes: z.string().trim().min(1).max(200).optional(),
   employees: range,
   followers: range,
   verified: z.boolean().optional(),
   active: z.boolean().optional(),
   showcase: z.boolean().optional(),
   hasWebsite: z.boolean().optional(),
   hasJobs: z.boolean().optional(),
}

const companyListInput = listInput.extend({
   ...drawerInput,
   cursor: z.number().int().min(1).nullish(),
   industries: values,
   countries: values,
   sort: z
      .object({
         by: z.enum(['createdAt', 'name']),
         desc: z.boolean(),
      })
      .optional(),
})

const countInput = companyListInput.omit({
   cursor: true,
   page: true,
   pageSize: true,
   sort: true,
})

// The saved ICP's company rules, only when it is the owner's.
const withIcp = async <T extends { icpId?: string; icpIncludeUnread?: boolean }>(userId: string, input: T) => {
   const { icpId, icpIncludeUnread, ...rest } = input

   if (!icpId) {
      return rest
   }

   const icp = present(await IcpService.getForUser(userId, icpId), 'Ideal customer not found')

   return {
      ...rest,
      icp: {
         rules: icp,
         includeUnread: icpIncludeUnread ?? false,
      },
   }
}

const viewInput = z.object({
   name: z.string().trim().min(1).max(80),
   query: z.string().max(4_000),
})

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

   // `cursor` is the page a scrolling table asks for next (TanStack infinite query); `nextCursor` is unset at the end.
   list: ownerProcedure.input(companyListInput).query(async ({ ctx, input }) => {
      const { cursor, ...query } = input
      const page = cursor ?? query.page
      const result = await orConflict(
         LinkedInCompanyService.list(ctx.user.id, {
            ...(await withIcp(ctx.user.id, query)),
            page,
         })
      )

      return {
         ...result,
         nextCursor: page * query.pageSize < result.total ? page + 1 : undefined,
      }
   }),

   // How many companies the drawer's filters match, before they are applied.
   count: ownerProcedure
      .input(countInput)
      .query(async ({ ctx, input }) =>
         orConflict(LinkedInCompanyService.count(ctx.user.id, await withIcp(ctx.user.id, input)))
      ),

   drawerFacets: ownerProcedure.query(({ ctx }) => LinkedInCompanyService.drawerFacets(ctx.user.id)),

   views: ownerProcedure.query(({ ctx }) => CompanyViewService.list(ctx.user.id)),

   saveView: ownerProcedure
      .input(viewInput)
      .mutation(({ ctx, input }) => CompanyViewService.save(ctx.user.id, input.name, input.query)),

   removeView: ownerProcedure
      .input(byId)
      .mutation(({ ctx, input }) => orConflict(CompanyViewService.remove(ctx.user.id, input.id))),

   facets: ownerProcedure.query(({ ctx }) => LinkedInCompanyService.facets(ctx.user.id)),

   get: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => found(await LinkedInCompanyService.getForUser(ctx.user.id, input.id), NOUN)),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return found(await LinkedInCompanyService.updateForUser(ctx.user.id, id, changes), NOUN)
   }),

   // Views a company page as one of the owner's accounts: waits a few seconds and scrolls the page.
   visit: visitProcedure('COMPANY'),

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
