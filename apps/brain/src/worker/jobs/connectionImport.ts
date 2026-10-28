import { ConnectionImportService, LinkedInConnectionService } from 'database'

import { defineJob } from './defineJob'

// Stores the connections of finished `linkedin-connections` runs, and ends the removals whose run was lost as unsure
// (.plan/my-connections.md). A table with nothing to do writes no log line.
export const connectionImport = defineJob({
   name: 'connection-import',
   title: 'Connections import',
   purpose:
      'Stores the connections that a finished read collected, so they show on the Connections page, and ends removals whose run was lost as unsure.',
   everyMs: 30_000,
   startAfterMs: 27_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const { done, retried, failed } = await ConnectionImportService.importDue(signal)
      const ended = await LinkedInConnectionService.endStale()

      return done + retried + failed + ended > 0
         ? {
              summary: `${done} runs stored, ${retried} to try again, ${failed} given up, ${ended} removals ended as unsure`,
              counts: {
                 stored: done,
                 retried,
                 failed,
                 ended,
              },
           }
         : undefined
   },
})
