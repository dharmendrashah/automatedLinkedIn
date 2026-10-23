import { AccountDailyJob } from 'database'

import { defineJob } from './defineJob'

// The daily sign-in check, visit and message read of every account, each at its own random time (.plan/account-daily-check.md). It wakes
// every 10 minutes and sends what is due, so a time missed while the worker was off is made up at the next wake-up.
export const accountDaily = defineJob({
   name: 'account-daily',
   everyMs: 10 * 60 * 1000,
   startAfterMs: 60_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const { checks, visits, reads } = await AccountDailyJob.runDue()

      return checks > 0 || visits > 0 || reads > 0
         ? { summary: `${checks} sign-in checks, ${visits} visits, ${reads} message reads asked for` }
         : undefined
   },
})
