import { AccountDailyJob } from 'database'

import { defineJob } from './defineJob'

// The daily sign-in check, visit and message read of every account, each at its own random time (.plan/account-daily-check.md). It wakes
// every 10 minutes and sends what is due, so a time missed while the worker was off is made up at the next wake-up.
export const accountDaily = defineJob({
   name: 'account-daily',
   title: 'Account checks, visits and message reads',
   purpose:
      "Asks for each LinkedIn account's daily sign-in check and visit and its message read every 2 hours, each at its own time, for accounts that are signed in.",
   everyMs: 10 * 60 * 1000,
   startAfterMs: 60_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const { accounts, checks, visits, reads, drawn, items } = await AccountDailyJob.runDue()

      if (accounts === 0) {
         return undefined
      }

      const counts = {
         accountsDue: accounts,
         checks,
         visits,
         reads,
         skipped: items.filter(({ result }) => result === 'SKIPPED').length,
         timesDrawn: drawn,
      }

      // Only what was asked for is a log line; accounts that were left alone are for the monitor.
      return checks > 0 || visits > 0 || reads > 0
         ? {
              summary: `${checks} sign-in checks, ${visits} visits, ${reads} message reads asked for`,
              counts,
              items,
           }
         : {
              counts,
              items,
           }
   },
})
