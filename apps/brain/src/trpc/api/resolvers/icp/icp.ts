import { z } from 'zod'

import { ICP_WEIGHTS, SENIORITIES, readSeniorities, scoreIcp } from 'core'

import { IcpService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Ideal customer not found'
const MAX_SAMPLES = 50

const byId = z.object({ id: z.string().min(1) })

const words = z
   .array(z.string().trim().toLowerCase().min(1).max(100))
   .max(50)
   .transform(values => [...new Set(values)])

const icpInput = z.object({
   name: z.string().trim().min(1).max(100),
   includeTitles: words,
   excludeTitles: words,
   seniorities: z.array(z.enum(SENIORITIES)).max(SENIORITIES.length),
   industries: words,
   companySizes: words,
   locations: words,
   problemKeywords: words,
})

const previewInput = z.object({
   id: z.string().min(1),
   // One person per line: a headline, optionally followed by " | " and a location.
   samples: z.string().max(20_000),
})

const readSample = (line: string) => {
   const at = line.lastIndexOf('|')
   const headline = (at === -1 ? line : line.slice(0, at)).trim()
   const location = at === -1 ? '' : line.slice(at + 1).trim()

   return {
      headline: headline || null,
      location: location || null,
   }
}

// Every procedure scopes to ctx.user.id, so one user can never reach another's ideal customers by id.
export const icp = router({
   list: ownerProcedure.query(({ ctx }) => IcpService.list(ctx.user.id)),

   create: ownerProcedure
      .input(icpInput)
      .mutation(({ ctx, input }) => orConflict(IcpService.create(ctx.user.id, input))),

   update: ownerProcedure.input(icpInput.extend(byId.shape)).mutation(async ({ ctx, input }) => {
      const { id, ...rules } = input

      return present(await orConflict(IcpService.update(ctx.user.id, id, rules)), MISSING)
   }),

   delete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await IcpService.delete(ctx.user.id, input.id), MISSING)
   }),

   // Scores sample people with the rules a headline and a location can prove; the rest is checked by a workflow.
   preview: ownerProcedure.input(previewInput).mutation(async ({ ctx, input }) => {
      const saved = present(await IcpService.getForUser(ctx.user.id, input.id), MISSING)
      const rules = {
         ...saved,
         seniorities: readSeniorities(saved.seniorities),
      }
      const lines = input.samples
         .split('\n')
         .map(line => line.trim())
         .filter(Boolean)
         .slice(0, MAX_SAMPLES)

      return {
         maxScore: ICP_WEIGHTS.title + ICP_WEIGHTS.seniority + ICP_WEIGHTS.location,
         results: lines.map(line => {
            const sample = readSample(line)

            return {
               ...sample,
               ...scoreIcp(rules, sample),
            }
         }),
      }
   }),
})
