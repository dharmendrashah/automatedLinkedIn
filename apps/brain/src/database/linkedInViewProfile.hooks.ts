import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const VIEW_PROFILE_TASK = 'linkedin-view-profile'

// Viewing someone's profile needs a session LinkedIn accepts. The visit row is saved with the session (ProfileVisitService); the run
// only moves it on from `ASKED` (.plan/visit-profile-task.md).
export const linkedInViewProfileHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Viewing a profile needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const status =
         result.verdict === 'DONE' ? 'DONE' : result.verdict === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'FAILED'

      await tx.linkedInProfileVisit.updateMany({
         where: {
            sessionId: session.id,
            status: 'ASKED',
         },
         data: {
            status,
            finishedAt: new Date(),
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
   },
}
