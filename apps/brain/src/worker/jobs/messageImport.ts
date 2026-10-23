import { MessageImportService } from 'database'

import { defineJob } from './defineJob'

// Stores the messages of finished `linkedin-messages` runs for their owners (.plan/unibox-backend.md). A table with nothing to do
// writes no log line.
export const messageImport = defineJob({
   name: 'message-import',
   everyMs: 30_000,
   startAfterMs: 20_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const { done, retried, failed } = await MessageImportService.importDue(signal)

      return done + retried + failed > 0
         ? { summary: `${done} runs stored, ${retried} to try again, ${failed} given up` }
         : undefined
   },
})
