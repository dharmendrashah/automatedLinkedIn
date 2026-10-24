import { z } from 'zod'

import { PageVisitService } from 'database'

import { ownerProcedure } from 'trpc'

import { asTrpcError } from './asTrpcError'
import { found } from './linkedInRecord'

const visitInput = z
   .object({
      accountId: z.string().min(1).max(100),
      // A profile or company the owner saved, or a link pasted for this visit: one of the two.
      id: z.string().min(1).max(100).optional(),
      link: z.string().min(1).max(500).optional(),
      // The owner saw that the account viewed a page a moment ago and wants this one anyway.
      confirmed: z.boolean().optional(),
   })
   .refine(value => (value.id === undefined) !== (value.link === undefined), 'Name a saved page or a link.')

const NOUN = {
   PROFILE: 'profile',
   COMPANY: 'company',
} as const

// Views a profile or a company page as one of the owner's accounts: waits a few seconds and scrolls the page
// (.plan/visit-profile-task.md, .plan/visit-company-task.md). Every call is scoped to ctx.user.id.
export const visitProcedure = (kind: keyof typeof NOUN) =>
   ownerProcedure.input(visitInput).mutation(async ({ ctx, input }) => {
      const saved = kind === 'PROFILE' ? { profileId: input.id ?? '' } : { companyId: input.id ?? '' }
      const target =
         input.id === undefined
            ? {
                 kind,
                 link: input.link ?? '',
              }
            : saved
      const visit = await PageVisitService.request(ctx.user.id, input.accountId, target, input.confirmed).catch(
         (error: unknown) => {
            throw asTrpcError(error)
         }
      )

      return found(visit, NOUN[kind])
   })
