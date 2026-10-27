import { z } from 'zod'

import { LinkedInConnectionService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'
import { present } from '../owned'

const id = z.string().min(1).max(100)
const NOT_FOUND = 'Account or connection not found'

// "Connections": the people one of the owner's accounts is connected to, and the two things the owner can ask (a read, and the removal of
// one). Every call is scoped to ctx.user.id, so a foreign account or connection answers like a missing one (.plan/my-connections.md).
// A connection is named by brain's id; the address of its profile goes to the spider only.
export const connections = router({
   // The connections of one account as the last read found them, with the state of a removal asked for and how the account stands;
   // light enough to ask every couple of seconds while a read or a removal goes on.
   list: ownerProcedure
      .input(z.object({ accountId: id }))
      .query(async ({ ctx, input }) =>
         present(await LinkedInConnectionService.list(ctx.user.id, input.accountId), NOT_FOUND)
      ),

   // Asks the spider to read the connections of the account. A refusal (not signed in, the browse budget) is a sentence, and the budget
   // ones carry their cause so the page can offer Start anyway.
   refresh: ownerProcedure
      .input(
         z.object({
            accountId: id,
            startAnyway: z.boolean().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const started = await LinkedInConnectionService.refresh(ctx.user.id, input.accountId, input.startAnyway).catch(
            (error: unknown) => {
               throw asTrpcError(error)
            }
         )

         return present(started, NOT_FOUND)
      }),

   // Asks the spider to remove one connection. It is asked once: a connection that is not on the list any more is refused.
   remove: ownerProcedure
      .input(
         z.object({
            accountId: id,
            id,
            startAnyway: z.boolean().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const started = await LinkedInConnectionService.remove(
            ctx.user.id,
            input.accountId,
            input.id,
            input.startAnyway
         ).catch((error: unknown) => {
            throw asTrpcError(error)
         })

         return present(started, NOT_FOUND)
      }),
})
