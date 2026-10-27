import { InvitationImportService, LinkedInInvitationService } from 'database'

import { defineJob } from './defineJob'

// Stores the connection requests of finished `linkedin-invitations` runs, and ends the requests whose run was lost as unsure
// (.plan/my-network-invitations.md). A table with nothing to do writes no log line.
export const invitationImport = defineJob({
   name: 'invitation-import',
   title: 'Connection request import',
   purpose:
      'Stores the connection requests that a finished read collected, so they show on My network, and ends answers whose run was lost as unsure.',
   everyMs: 30_000,
   startAfterMs: 25_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const { done, retried, failed } = await InvitationImportService.importDue(signal)
      const ended = await LinkedInInvitationService.endStale()

      return done + retried + failed + ended > 0
         ? {
              summary: `${done} runs stored, ${retried} to try again, ${failed} given up, ${ended} answers ended as unsure`,
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
