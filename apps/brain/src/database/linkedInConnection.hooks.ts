import { HANDS_OVER, NOT_DONE } from './invitationRules'
import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const CONNECTIONS_TASK = 'linkedin-connections'

// Reading and removing connections needs a session LinkedIn accepts. A run that was asked to remove one ends it as unsure, or as failed
// when the verdict says nothing was pressed; the file of the run, when there is one, is queued to be stored by the worker, which reads it
// outside this transaction and settles each connection exactly (.plan/my-connections.md).
export const linkedInConnectionHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Connections need an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      await tx.linkedInConnection.updateMany({
         where: {
            sessionId: session.id,
            status: 'REMOVING',
         },
         data: {
            status: NOT_DONE.has(result.verdict) ? 'FAILED' : 'UNKNOWN',
            failure: result.message,
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

      if (HANDS_OVER.has(result.verdict)) {
         await tx.connectionImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }
   },
}
