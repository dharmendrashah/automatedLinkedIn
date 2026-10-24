import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

export const PROFILE_TASK = 'linkedin-profile'

// Reading the profile needs a session LinkedIn accepts. The first ask of an account is noted in the request's transaction, so
// the first visit of the page starts one read only; a run that read something is queued to be stored by the worker, which reads
// its file outside this transaction (.plan/account-profile-backend.md).
export const linkedInProfileHooks: TaskHooks = {
   async onRequest({ accountId, trigger }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Reading the profile needs an account that is signed in. Run Test login first.')
      }

      const { count } = await tx.linkedInAccount.updateMany({
         where: {
            id: accountId,
            profileAskedAt: null,
         },
         data: { profileAskedAt: new Date() },
      })

      if (count === 0 && trigger === 'automatic') {
         throw new TaskRefusedError('The profile was already asked for.')
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
         await tx.profileImport.createMany({
            data: [{ sessionId: session.id }],
            skipDuplicates: true,
         })
      }
   },
}
