import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const VIEW_PROFILE_TASK = 'linkedin-view-profile'
export const VIEW_COMPANY_TASK = 'linkedin-view-company'

// Viewing someone's profile or a company page needs a session LinkedIn accepts. The visit row is saved with the session
// (PageVisitService); the run only moves it on from `ASKED` (.plan/visit-profile-task.md, .plan/visit-company-task.md).
export const linkedInVisitHooks: TaskHooks = {
   async onRequest({ accountId }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Viewing a page needs an account that is signed in. Run Test login first.')
      }
   },

   async onResult(session, result, tx) {
      const status =
         result.verdict === 'DONE' ? 'DONE' : result.verdict === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'FAILED'

      await tx.linkedInPageVisit.updateMany({
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
