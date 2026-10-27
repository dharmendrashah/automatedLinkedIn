import { HANDS_OVER, NOT_DONE } from './invitationRules'
import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const INVITATIONS_TASK = 'linkedin-invitations'

// Reading and answering connection requests needs a session LinkedIn accepts. A run that was asked to answer ends the requests it
// was asked for as unsure, or as failed when the verdict says nothing was clicked; the file of the run, when there is one, is
// queued to be stored by the worker, which reads it outside this transaction and settles each request exactly
// (.plan/my-network-invitations.md).
export const linkedInInvitationHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Connection requests need an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      await tx.linkedInInvitation.updateMany({
         where: {
            sessionId: session.id,
            status: 'QUEUED',
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
         await tx.invitationImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }
   },
}
