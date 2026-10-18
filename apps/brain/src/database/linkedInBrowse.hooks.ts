import { type TaskHooks } from './taskHooks'

// The daily visit changes nothing on the account itself. When it finds the session signed out, the sign-in check runs on the
// next pass of the daily job, and its verdict is what the owner sees.
export const linkedInBrowseHooks: TaskHooks = {
   async onResult(session, result, tx) {
      if (result.verdict !== 'SIGNED_OUT') {
         return
      }

      await tx.linkedInAccount.updateMany({
         where: {
            id: session.linkedInAccountId,
            status: 'ACTIVE',
         },
         data: { nextCheckAt: new Date() },
      })
   },
}
