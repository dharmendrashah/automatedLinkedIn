import { ProxyScoringJob } from 'database'

import { defineJob } from './defineJob'

// Scores every proxy once a day (reputation and latency). It wakes every hour and does what is due, so a day missed while
// the worker was off is made up at the next wake-up.
export const proxyScoring = defineJob({
   name: 'proxy-scoring',
   title: 'Proxy scoring',
   purpose:
      'Tests and scores every proxy once a day (speed and abuse reputation) so the best one is used for each account.',
   everyMs: 60 * 60 * 1000,
   startAfterMs: 60_000,
   timeoutMs: 30 * 60 * 1000,
   run: async () => {
      const { scored, failed, items } = await ProxyScoringJob.runDue()

      return scored > 0 || failed > 0
         ? {
              summary: `${scored} scored, ${failed} failed`,
              counts: {
                 scored,
                 failed,
              },
              items,
           }
         : undefined
   },
})
