import { ProfileImportService } from 'database'

import { defineJob } from './defineJob'

// Stores the profile of finished `linkedin-profile` runs for their owners (.plan/account-profile-backend.md). A table with nothing
// to do writes no log line.
export const profileImport = defineJob({
   name: 'profile-import',
   title: 'Profile import',
   purpose: 'Stores the profile that a finished profile read collected, so the account page shows it.',
   everyMs: 30_000,
   startAfterMs: 25_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const { done, retried, failed } = await ProfileImportService.importDue(signal)

      return done + retried + failed > 0
         ? {
              summary: `${done} profiles stored, ${retried} to try again, ${failed} given up`,
              counts: {
                 stored: done,
                 retried,
                 failed,
              },
           }
         : undefined
   },
})
