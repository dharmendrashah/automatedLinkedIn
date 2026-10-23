import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
   LinkedInConversationService,
   LinkedInReplyService,
   MAX_IDS,
   MessagesRefresh,
   REPLY_LIMITS,
   TaskRefusedError,
} from 'database'

import { MAX_ATTACHMENT_BYTES, UPLOAD_ID } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { present } from '../owned'

const WORDS_OR_FILES = { message: 'A reply needs words or files.' }
const id = z.string().min(1).max(100)
const ids = z.array(id).min(1).max(MAX_IDS)

// A refusal brain wrote as a sentence for the owner (the limits, a type, an account that is busy) is a precondition that failed.
const orRefused = async <T>(work: Promise<T>) => {
   try {
      return await work
   } catch (error) {
      if (error instanceof TaskRefusedError) {
         throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: error.message,
         })
      }

      throw error
   }
}

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

   // A short link to open a file kept with a message (the first, second... attachment of it). The files stay for good; a link works
   // for ten minutes. A message or a file that is not the owner's answers like a missing one.
   fileLink: ownerProcedure
      .input(
         z.object({
            messageId: id,
            index: z.number().int().min(0).max(49),
         })
      )
      .query(async ({ ctx, input }) => ({
         url: present(
            await LinkedInConversationService.fileLink(ctx.user.id, input.messageId, input.index),
            'File not found'
         ),
      })),

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

   // Types the reply into the account's own LinkedIn page, as the owner would, and answers at once with the reply to follow.
   // The text is never logged. Refused with a sentence when the limits or the account do not allow it now.
   send: ownerProcedure
      .input(
         z
            .object({
               conversationId: id,
               text: z.string().trim().max(REPLY_LIMITS.maxChars),
               // The files of the reply, kept by brain since the page uploaded them (.plan/unibox-send-attachments.md).
               uploadId: z.string().regex(UPLOAD_ID).optional(),
            })
            .refine(({ text, uploadId }) => text !== '' || uploadId !== undefined, WORDS_OR_FILES)
      )
      .mutation(async ({ ctx, input }) =>
         orRefused(
            LinkedInReplyService.send(ctx.user.id, input.conversationId, input.text, input.uploadId).then(sent =>
               present(sent, 'Conversation not found')
            )
         )
      ),

   // A signed form to post one file of a reply straight to the bucket; the file never passes through brain. It is checked when the reply is
   // sent. Refused with a sentence for a type LinkedIn does not take, a file too large or empty, or too many files.
   uploadForm: ownerProcedure
      .input(
         z.object({
            uploadId: z.string().regex(UPLOAD_ID),
            name: z.string().min(1).max(300),
            bytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
         })
      )
      .mutation(({ ctx, input }) =>
         orRefused(LinkedInReplyService.uploadForm(ctx.user.id, input.uploadId, input.name, input.bytes))
      ),

   // Where a reply is: SENDING, SENT, FAILED or UNKNOWN (it may have gone), with a sentence when it did not.
   reply: ownerProcedure
      .input(z.object({ id }))
      .query(async ({ ctx, input }) =>
         present(await LinkedInReplyService.get(ctx.user.id, input.id), 'Reply not found')
      ),
})
