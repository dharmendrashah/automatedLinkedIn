import { type Prisma } from 'generated/prisma/client'

import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const INVITE_TASK = 'linkedin-invite'

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
const HANDS_OVER = new Set(['DONE', 'PARTIAL', 'UNKNOWN', 'LIMIT_REACHED', 'RESTRICTED', 'SIGNED_OUT'])

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const STOPS: Record<string, string> = {
   SIGNED_OUT: 'LinkedIn signed the account out. Invites go on after the next good sign-in.',
   RESTRICTED: 'LinkedIn restricted the account. Invites go on after the next good sign-in.',
   LIMIT_REACHED: 'LinkedIn said the account may not invite more for now. Invites go on when its week rolls.',
}

// Stops the account's invites: until its next good sign-in, or for LinkedIn's limit until a week after the oldest invite of its week.
const stop = async (tx: Prisma.TransactionClient, accountId: string, verdict: string, now: Date) => {
   const oldest =
      verdict === 'LIMIT_REACHED'
         ? await tx.linkedInInvite.findFirst({
              where: {
                 accountId,
                 startedAt: { gte: new Date(now.getTime() - WEEK_MS) },
              },
              orderBy: { startedAt: 'asc' },
              select: { startedAt: true },
           })
         : null

   await tx.linkedInAccount.update({
      where: { id: accountId },
      data: {
         invitesStoppedAt: now,
         invitesStopReason: STOPS[verdict] ?? null,
         invitesStopUntil:
            verdict === 'LIMIT_REACHED' ? new Date((oldest?.startedAt ?? now).getTime() + WEEK_MS) : null,
      },
   })
}

// Invites need a session LinkedIn accepts. A result puts the run's invites in a safe state at once (back in the queue when nothing
// was pressed, unsure otherwise), stops the account's invites on trouble, and queues the run's file, which settles each invite exactly.
export const linkedInInviteHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Invites need an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const now = new Date()
      const untouched = NOTHING_PRESSED.has(result.verdict)

      await tx.linkedInInvite.updateMany({
         where: {
            sessionId: session.id,
            state: 'SENDING',
         },
         data: untouched
            ? {
                 state: 'QUEUED',
                 tries: { increment: 1 },
              }
            : {
                 state: 'UNKNOWN',
                 reason: 'LinkedIn did not show whether it was sent. It is not sent again.',
              },
      })
      await tx.linkedInInvite.updateMany({
         where: {
            sessionId: session.id,
            state: 'WITHDRAWING',
         },
         data: { state: 'WITHDRAW_QUEUED' },
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
         await tx.inviteImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }
   },
}
