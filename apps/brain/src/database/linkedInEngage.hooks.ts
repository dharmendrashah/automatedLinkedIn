import { type Prisma } from 'generated/prisma/client'

import { ENGAGE_LIMITS, ENGAGE_TASK } from '@automatedLinkedIn/contracts'

import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export { ENGAGE_TASK }

// Answers after which nothing was pressed: the runner's that end a task before it starts, and ERROR, which the task gives only for a
// failure before its first press.
const NOTHING_PRESSED = new Set([
   'ERROR',
   'UNKNOWN_TASK',
   'INVALID_INPUT',
   'NEEDS_PROXY',
   'NEEDS_ACCOUNT',
   'NOT_ALLOWED',
   'NOT_QUEUED',
   'NOT_STARTED',
   'CANCELLED',
])

// The verdicts the task hands its file over with.
const HANDS_OVER = new Set(['DONE', 'PARTIAL', 'NONE_DONE', 'LIMIT_REACHED', 'RESTRICTED', 'SIGNED_OUT'])

const HOUR_MS = 60 * 60 * 1000

const STOPS: Record<string, string> = {
   SIGNED_OUT: 'LinkedIn signed the account out. Engaging goes on after the next good sign-in.',
   RESTRICTED: 'LinkedIn restricted the account. Engaging goes on after the next good sign-in.',
   LIMIT_REACHED: 'LinkedIn said the account may not engage more for now. Engaging goes on in 24 hours.',
}

// Engaging needs a session LinkedIn accepts. A result puts the run's acts in a safe state at once (back in the queue when nothing was
// pressed, unsure otherwise), stops the account's engaging on trouble (until its next good sign-in, or for a day when LinkedIn said
// enough), and queues the run's file, which settles each act exactly.
export const linkedInEngageHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Engaging needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const now = new Date()
      const untouched = NOTHING_PRESSED.has(result.verdict)

      await tx.postAct.updateMany({
         where: {
            sessionId: session.id,
            state: 'SENDING',
         },
         data: untouched
            ? {
                 state: 'QUEUED',
                 sessionId: null,
                 startedAt: null,
              }
            : {
                 state: 'UNKNOWN',
                 reason: 'LinkedIn did not show whether it went. It is not sent again.',
              },
      })

      if (STOPS[result.verdict]) {
         await stop(tx, session.linkedInAccountId, result.verdict, now)
      }

      if (result.verdict === 'SIGNED_OUT') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               status: 'ACTIVE',
            },
            data: { nextCheckAt: now },
         })
      }

      if (HANDS_OVER.has(result.verdict)) {
         await tx.engageImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }
   },
}

const stop = async (tx: Prisma.TransactionClient, accountId: string, verdict: string, now: Date) => {
   await tx.linkedInAccount.update({
      where: { id: accountId },
      data: {
         engageStoppedAt: now,
         engageStopReason: STOPS[verdict] ?? null,
         engageStopUntil:
            verdict === 'LIMIT_REACHED' ? new Date(now.getTime() + ENGAGE_LIMITS.refusedStopHours * HOUR_MS) : null,
      },
   })
}
