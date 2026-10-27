import { z } from 'zod'

import { LinkedInInvitationService } from 'database'

import { INVITATION_LIMITS, invitationActionSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'
import { present } from '../owned'

const id = z.string().min(1).max(100)
const byAccounts = z.object({ accountIds: z.array(id).min(1).max(100) })
const NOT_FOUND = 'Account not found'

// "My network": the connection requests the owner's accounts received, and the two things the owner can ask (a read, and answers).
// Every call is scoped to ctx.user.id, so a foreign account or request answers like a missing one
// (.plan/my-network-invitations.md, .plan/my-network-all-accounts.md). Requests are named by brain's id; LinkedIn's own number never
// leaves brain.
export const network = router({
   // How many requests wait for each of the owner's accounts.
   waiting: ownerProcedure
      .input(z.object({ accountIds: z.array(id).max(500) }))
      .query(({ ctx, input }) => LinkedInInvitationService.waiting(ctx.user.id, input.accountIds)),

   // The requests of the accounts asked for as the last read found them, with the state of any answer asked for and how each
   // account stands; light enough to ask every couple of seconds while a read or an answer goes on.
   list: ownerProcedure
      .input(byAccounts)
      .query(async ({ ctx, input }) =>
         present(await LinkedInInvitationService.list(ctx.user.id, input.accountIds), NOT_FOUND)
      ),

   // Asks the spider to read the requests of these accounts. An account that is not signed in, or that the browse budget refuses now,
   // is skipped with its sentence (and `budget` when the owner may go past it with `startAnyway`); the others are asked.
   refresh: ownerProcedure
      .input(byAccounts.extend({ startAnyway: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
         const result = await LinkedInInvitationService.refresh(ctx.user.id, input.accountIds, input.startAnyway).catch(
            (error: unknown) => {
               throw asTrpcError(error)
            }
         )

         return present(result, NOT_FOUND)
      }),

   // Asks the spider to Accept or Ignore these requests, in this order. They are asked for once: a request that is not waiting any
   // more is refused.
   answer: ownerProcedure
      .input(
         z.object({
            accountId: id,
            answers: z
               .array(
                  z.object({
                     id,
                     action: invitationActionSchema,
                  })
               )
               .min(1)
               .max(INVITATION_LIMITS.perRun),
            startAnyway: z.boolean().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const started = await LinkedInInvitationService.answer(
            ctx.user.id,
            input.accountId,
            input.answers,
            input.startAnyway
         ).catch((error: unknown) => {
            throw asTrpcError(error)
         })

         return present(started, 'Account or request not found')
      }),
})
