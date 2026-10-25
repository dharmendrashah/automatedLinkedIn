import { RetentionService } from 'database'

import { defineJob } from './defineJob'

// Deletes run data, old runs, Maybe people and the spend record on time, and marks people untouched for 180 days for
// review (.plan/gtm-phase-3-blocks-triggers.md). A run that deleted nothing writes no log line.
export const retention = defineJob({
   name: 'retention',
   title: 'Data retention',
   purpose:
      "Deletes data that is past its time: old workflow runs and items, the spend record, the browsing time of accounts, and this monitor's own history.",
   everyMs: 6 * 60 * 60 * 1000,
   startAfterMs: 5 * 60 * 1000,
   timeoutMs: 30 * 60 * 1000,
   run: async () => {
      const counts = await RetentionService.run()
      const changed = Object.entries(counts).filter(([, count]) => count > 0)

      return changed.length > 0
         ? {
              summary: changed.map(([what, count]) => `${count} ${what}`).join(', '),
              counts,
           }
         : undefined
   },
})
