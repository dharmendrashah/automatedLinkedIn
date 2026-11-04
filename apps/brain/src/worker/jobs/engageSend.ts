import { EngageImportService, LinkedInEngageService } from 'database'

import { defineJob } from './defineJob'

// Stores what finished engage runs did and gives each account with acts due its next run of up to 10 (.plan/lead-pipeline-p3-engage.md).
// Idle passes write nothing. Until the engage task is built nothing is asked of the spider, so acts wait in their queue.
export const engageSend = defineJob({
   name: 'engage-send',
   title: 'Reactions and comments queue',
   purpose:
      'Sends the reactions and comments asked for by workflows, up to 10 a run within each account\u2019s own daily limit, and stores what each run did.',
   everyMs: 60_000,
   startAfterMs: 50_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      const stored = await EngageImportService.importDue(signal)
      const { asked, stale, expired, items } = await LinkedInEngageService.dispatchWaiting()
      const done = stored.done + stored.retried + stored.failed

      if (items.length === 0 && done + stale + expired === 0) {
         return undefined
      }

      const summary = `${asked} engage runs asked for, ${done} runs stored, ${stale} runs ended with no answer, ${expired} acts expired`

      return {
         ...(asked + done + stale + expired > 0 && { summary }),
         counts: {
            asked,
            stored: stored.done,
            retried: stored.retried,
            failed: stored.failed,
            stale,
            expired,
         },
         items,
      }
   },
})
