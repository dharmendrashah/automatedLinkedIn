import { z } from 'zod'

import { type Prisma } from 'generated/prisma/client'

import { MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

import { TaskRefusedError } from './taskErrors'
import { type FinishedSession, type TaskHooks } from './taskHooks'

export const MESSAGES_TASK = 'linkedin-messages'

// What the run was asked for, as the session saved it (the task's own defaults when a field was left out).
const runParamsSchema = z.object({
   input: z.object({
      skip: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).default(50),
   }),
})

// A partly read run says where to go on from; the batch ends where the run was asked to end (.plan/messages-resume.md). Nothing
// when either is unreadable, so a bad answer never makes a loop.
const batchAfter = async (session: FinishedSession, result: TaskResult, tx: Prisma.TransactionClient) => {
   const row = await tx.spiderSession.findUnique({
      where: { id: session.id },
      select: { requestParams: true },
   })
   const params = runParamsSchema.safeParse(row?.requestParams)
   const reported = Number(
      result.report?.sections.flatMap(({ items }) => items).find(({ label }) => label === MESSAGES_NEXT_SKIP_LABEL)
         ?.value
   )

   if (!params.success) {
      return undefined
   }

   const { skip, limit } = params.data.input
   const until = skip + limit

   return Number.isInteger(reported) && reported > skip && reported < until
      ? {
           skip: reported,
           until,
        }
      : undefined
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

         // Fully read: nothing is pending. Partly read: the next read, within minutes, goes on after what was read, to where the
         // batch ends.
         const batch = result.verdict === 'PARTIAL' ? await batchAfter(session, result, tx) : undefined

         await tx.linkedInAccount.updateMany({
            where: { id: session.linkedInAccountId },
            data: {
               messagesResumeSkip: batch?.skip ?? null,
               messagesResumeUntil: batch?.until ?? null,
               ...(batch && { nextMessagesAt: new Date() }),
            },
         })
      }
   },
}
