import { z } from 'zod'

import { type Prisma } from 'generated/prisma/client'

import { MESSAGES_FINISHED_LABEL, MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

import { TaskRefusedError } from './taskErrors'
import { type FinishedSession, type TaskHooks } from './taskHooks'

export const MESSAGES_TASK = 'linkedin-messages'

// The first read of an account waits this long after a batch before the next one (.plan/messages-first-sync-and-new-only.md).
const BATCH_PAUSE_MS = 30 * 60 * 1000

// What the run was asked for, as the session saved it (the task's own defaults when a field was left out).
const runParamsSchema = z.object({
   input: z.object({
      skip: z.number().int().min(0).default(0),
      stopAfterKnown: z.number().int().optional(),
   }),
})

const valueOf = (result: TaskResult, label: string) =>
   result.report?.sections.flatMap(({ items }) => items).find(item => item.label === label)?.value

// Where a read that did not finish goes on from. Nothing when either is unreadable, so a bad answer never makes a loop.
const placeAfter = async (session: FinishedSession, result: TaskResult, tx: Prisma.TransactionClient) => {
   const row = await tx.spiderSession.findUnique({
      where: { id: session.id },
      select: { requestParams: true },
   })
   const params = runParamsSchema.safeParse(row?.requestParams)
   const next = Number(valueOf(result, MESSAGES_NEXT_SKIP_LABEL))

   if (!params.success) {
      return undefined
   }

   const { skip, stopAfterKnown } = params.data.input

   return {
      next: Number.isInteger(next) && next > skip ? next : undefined,
      walking: stopAfterKnown !== undefined,
   }
}

// Reading the messages needs a session LinkedIn accepts. A run that read something is queued to be stored; the importer reads
// its files outside this transaction, because a hook makes no network call (.plan/unibox-backend.md).
export const linkedInMessagesHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Reading the messages needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      if (result.verdict === 'SIGNED_OUT') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               status: 'ACTIVE',
            },
            data: { nextCheckAt: new Date() },
         })

         return
      }

      if (result.verdict === 'DONE' || result.verdict === 'PARTIAL') {
         await tx.messageImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })

         const account = await tx.linkedInAccount.findUnique({
            where: { id: session.linkedInAccountId },
            select: { messagesBackfilledAt: true },
         })
         const first = account?.messagesBackfilledAt === null
         const place = await placeAfter(session, result, tx)
         const finished = valueOf(result, MESSAGES_FINISHED_LABEL) === 'Yes'
         const now = new Date()
         const data: Prisma.LinkedInAccountUpdateManyMutationInput = { messagesReadAt: now }

         // The first read, and a later one that stops at known rows, say where they go on from; a sweep says nothing of it.
         if (first || place?.walking) {
            if (finished) {
               data.messagesResumeSkip = null

               if (first) {
                  data.messagesBackfilledAt = now
                  data.messagesSweptAt = now
               }
            } else if (place?.next !== undefined) {
               data.messagesResumeSkip = place.next
               data.nextMessagesAt = new Date(now.getTime() + (first ? BATCH_PAUSE_MS : 0))
            }
         }

         await tx.linkedInAccount.updateMany({
            where: { id: session.linkedInAccountId },
            data,
         })
      }
   },
}
