import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const MESSAGES_TASK = 'linkedin-messages'

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
      }
   },
}
