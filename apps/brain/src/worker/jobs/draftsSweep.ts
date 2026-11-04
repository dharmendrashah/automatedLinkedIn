import { DraftService } from 'database'

import { defineJob } from './defineJob'

// Ends the drafts no one decided in time, cancels the ones that went stale, and clears the text of old drafts after 30 days
// (.plan/lead-pipeline-p4-ai-drafts.md). Idle passes write nothing.
export const draftsSweep = defineJob({
   name: 'drafts-sweep',
   title: 'Drafts clean-up',
   purpose:
      'Expires drafts nobody decided in time, cancels comments for people who accepted meanwhile, and clears the text of drafts older than 30 days.',
   everyMs: 60 * 60 * 1000,
   startAfterMs: 90_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const { expired, cancelled, cleared } = await DraftService.sweep()

      if (expired + cancelled + cleared === 0) {
         return undefined
      }

      return {
         summary: `${expired} drafts expired, ${cancelled} cancelled, ${cleared} cleared`,
         counts: {
            expired,
            cancelled,
            cleared,
         },
      }
   },
})
