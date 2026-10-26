import { z } from 'zod'

import { AccountProfileService, PROFILE_TASK, TaskService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'
import { present } from '../owned'

const byAccount = z.object({ accountId: z.string().min(1).max(100) })
const NOT_FOUND = 'Account not found'

// The profile of one of the owner's accounts (.plan/account-profile-backend.md). Every call is scoped to ctx.user.id; a foreign
// account is answered like a missing one.
export const accountProfile = router({
   // Light and without profile content: the page asks it every few seconds while a read goes on.
   state: ownerProcedure
      .input(byAccount)
      .query(async ({ ctx, input }) =>
         present(await AccountProfileService.state(ctx.user.id, input.accountId), NOT_FOUND)
      ),

   // `version` is the state's `capturedAt`: the server ignores it, the page uses it as a cache key so a new read is fetched once.
   get: ownerProcedure
      .input(byAccount.extend({ version: z.string().max(40).nullish() }))
      .query(({ ctx, input }) => AccountProfileService.get(ctx.user.id, input.accountId)),

   // The first visit of the page: starts the first read once, if the account is signed in. Asking again does nothing.
   open: ownerProcedure
      .input(byAccount)
      .mutation(async ({ ctx, input }) =>
         present(await AccountProfileService.open(ctx.user.id, input.accountId), NOT_FOUND)
      ),

   // The Read profile button.
   read: ownerProcedure
      .input(
         byAccount.extend({
            confirmed: z.boolean().optional(),
            startAnyway: z.boolean().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         try {
            return await TaskService.request({
               userId: ctx.user.id,
               task: PROFILE_TASK,
               accountId: input.accountId,
               confirmed: input.confirmed,
               startAnyway: input.startAnyway,
               trigger: 'manual',
            })
         } catch (error) {
            throw asTrpcError(error)
         }
      }),
})
