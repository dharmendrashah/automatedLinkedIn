import { AccountDailyJob } from 'database'

import { defineJob } from './defineJob'

// The daily sign-in check, visit and read of the connection requests, and the message read every 2 hours, of every account, each at its
// own random time (.plan/account-daily-check.md, .plan/my-network-daily-read.md); a new account's first reads, and the weekly read of
// the connections and monthly read of the own profile after them (.plan/first-day-reads.md). It wakes every 10 minutes and sends what
// is due, so a time missed while the worker was off is made up at the next wake-up.
export const accountDaily = defineJob({
   name: 'account-daily',
   title: 'Account checks, visits and reads',
   purpose:
      "Asks for each signed-in LinkedIn account's first reads (own profile, connection requests, connections, messages), then its daily sign-in check, visit and read of the connection requests, its message read every 2 hours, and its weekly connections and monthly profile reads, each at its own time.",
   everyMs: 10 * 60 * 1000,
   startAfterMs: 60_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const { accounts, checks, visits, reads, invitationReads, firstReads, repeatReads, drawn, items } =
         await AccountDailyJob.runDue()

      if (accounts === 0) {
         return undefined
      }

      const counts = {
         accountsDue: accounts,
         checks,
         visits,
         reads,
         invitationReads,
         firstReads,
         repeatReads,
         skipped: items.filter(({ result }) => result === 'SKIPPED').length,
         timesDrawn: drawn,
      }

      // Only what was asked for is a log line; accounts that were left alone are for the monitor.
      return checks + visits + reads + invitationReads + firstReads + repeatReads > 0
         ? {
              summary: `${checks} sign-in checks, ${visits} visits, ${reads} message reads, ${invitationReads} connection request reads, ${firstReads} first reads, ${repeatReads} weekly or monthly reads asked for`,
              counts,
              items,
           }
         : {
              counts,
              items,
           }
   },
})
