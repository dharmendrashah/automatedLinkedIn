import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { LinkedInConversationService, MAX_IDS, MessagesRefresh } from 'database'

import { ownerProcedure, router } from 'trpc'

import { present } from '../owned'

const id = z.string().min(1).max(100)
const ids = z.array(id).min(1).max(MAX_IDS)

// The Unibox: the owner's conversations as the spider read them, and the owner's own marks on them. Every call is scoped to
// ctx.user.id, so a foreign id answers like a missing one. See .plan/unibox-backend.md.
export const unibox = router({
   accounts: ownerProcedure.query(({ ctx }) => LinkedInConversationService.accounts(ctx.user.id)),

   // The newest conversations (3,000 at most) with their latest messages.
   conversations: ownerProcedure
      .input(z.object({ accountIds: z.array(id).max(MAX_IDS).optional() }))
      .query(({ ctx, input }) => LinkedInConversationService.list(ctx.user.id, input.accountIds)),

   // One conversation with its messages, oldest first (the newest 500 when it is longer).
   conversation: ownerProcedure
      .input(z.object({ id }))
      .query(async ({ ctx, input }) =>
         present(await LinkedInConversationService.get(ctx.user.id, input.id), 'Conversation not found')
      ),

   setUnread: ownerProcedure
      .input(
         z.object({
            ids,
            unread: z.boolean(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const changed = await LinkedInConversationService.setUnread(ctx.user.id, input.ids, input.unread)

         return { changed }
      }),

   setDone: ownerProcedure
      .input(
         z.object({
            ids,
            done: z.boolean(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const changed = await LinkedInConversationService.setDone(ctx.user.id, input.ids, input.done)

         return { changed }
      }),

   // Asks the spider to read the messages again. Opening a conversation on LinkedIn marks it read there, and the other person
   // sees it, which is why this is only ever done on request or by the account's daily read.
   refresh: ownerProcedure
      .input(z.object({ accountIds: z.array(id).max(MAX_IDS).optional() }))
      .mutation(async ({ ctx, input }) => {
         const result = await MessagesRefresh.request(ctx.user.id, input.accountIds)

         if (result.started === 0 && result.skipped.length === 0) {
            throw new TRPCError({
               code: 'NOT_FOUND',
               message: 'No account to read.',
            })
         }

         return result
      }),
})
