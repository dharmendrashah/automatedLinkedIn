import { dailyTime, timezoneOfCountry } from 'core'

import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

// The visit needs a session LinkedIn accepts. When it finds the session signed out, the sign-in check runs on the next pass
// of the daily job, and its verdict is what the owner sees. A visit the owner asked for counts as the day's visit.
export const linkedInBrowseHooks: TaskHooks = {
   async onRequest({ accountId, proxyId, trigger }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('The visit needs an account that is signed in. Run Test login first.')
      }

      // The daily job moves its own time when it asks.
      if (trigger === 'automatic') {
         return
      }

      const proxy = proxyId
         ? await tx.proxyServer.findUnique({
              where: { id: proxyId },
              select: { detectedCountryCode: true },
           })
         : null

      await tx.linkedInAccount.update({
         where: { id: accountId },
         data: { nextBrowseAt: dailyTime(new Date(), timezoneOfCountry(proxy?.detectedCountryCode), { today: false }) },
      })
   },

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
