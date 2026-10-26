import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const REPLY_TASK = 'linkedin-reply'

// The answers after which nothing was typed or sent: ours that say so, and the runner's that end a task before it starts. Any
// other answer (a timeout, a crash, a lost proxy) may have come after send was pressed, so the reply is unsure.
const NOT_SENT = new Set([
   'FAILED',
   'NO_COMPOSER',
   'WRONG_THREAD',
   'SIGNED_OUT',
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

// A reply needs a session LinkedIn accepts. The result sets the reply from the verdict, queues the conversation to be stored again
// (the spider hands the page as it shows after the send), and asks for a sign-in check when LinkedIn said signed out.
export const linkedInReplyHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Replying needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const sent = result.verdict === 'SENT'
      const state = sent ? 'SENT' : NOT_SENT.has(result.verdict) ? 'FAILED' : 'UNKNOWN'

      // A reply that already shows as sent stays so; one the sweep ended as unsure is set by the real answer.
      await tx.linkedInReply.updateMany({
         where: {
            sessionId: session.id,
            state: { not: 'SENT' },
         },
         data: {
            state,
            failure: sent ? null : result.message,
            sentAt: sent ? new Date() : null,
         },
      })

      if (result.verdict === 'SIGNED_OUT') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               status: 'ACTIVE',
            },
            data: { nextCheckAt: new Date() },
         })
      }

      if (state !== 'FAILED') {
         await tx.messageImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }

      // An unsure reply is settled by the next read of the account, which finds its message if it went: ask for that read now, which
      // the daily job sends within minutes under its own rules, instead of at the next time it had drawn.
      if (state === 'UNKNOWN') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               status: 'ACTIVE',
            },
            data: { nextMessagesAt: new Date() },
         })
      }
   },
}
