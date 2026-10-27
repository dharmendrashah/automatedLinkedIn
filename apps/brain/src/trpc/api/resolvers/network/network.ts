import { z } from 'zod'

import { LinkedInInvitationService } from 'database'

import { INVITATION_LIMITS, invitationActionSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'
import { present } from '../owned'

const id = z.string().min(1).max(100)
const byAccount = z.object({ accountId: id })
const NOT_FOUND = 'Account not found'

// "My network": the connection requests an account received, and the two things the owner can ask (a read, and answers). Every call is
// scoped to ctx.user.id, so a foreign account or request answers like a missing one (.plan/my-network-invitations.md). Requests are
// named by brain's id; LinkedIn's own number never leaves brain.
export const network = router({
   // How many requests wait for each of the owner's accounts.
   waiting: ownerProcedure
      .input(z.object({ accountIds: z.array(id).max(500) }))
      .query(({ ctx, input }) => LinkedInInvitationService.waiting(ctx.user.id, input.accountIds)),

   // The requests of one account as the last read found them, with the state of any answer asked for; light enough to ask every
   // couple of seconds while a read or an answer goes on.
   list: ownerProcedure
      .input(byAccount)
      .query(async ({ ctx, input }) =>
         present(await LinkedInInvitationService.snapshot(ctx.user.id, input.accountId), NOT_FOUND)
      ),

   // Asks the spider to read the requests. Refused with a sentence when the account is not signed in or is busy; refused with
   // `budgetRefusal` when it may not browse now, which the owner may go past with `startAnyway`.
   refresh: ownerProcedure
      .input(byAccount.extend({ startAnyway: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
         const started = await LinkedInInvitationService.refresh(ctx.user.id, input.accountId, input.startAnyway).catch(
            (error: unknown) => {
               throw asTrpcError(error)
            }
         )

         return present(started, NOT_FOUND)
      }),

   // Asks the spider to Accept or Ignore these requests, in this order. They are asked for once: a request that is not waiting any
   // more is refused.
   answer: ownerProcedure
      .input(
         byAccount.extend({
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
