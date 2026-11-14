import { PositiveReplyService } from 'database'

import { defineJob } from './defineJob'

// Reads, once each, the replies the word rules were not sure about, and counts the ones the AI finds positive
// (.plan/campaign-revenue-pipeline.md). Waits while the AI is off or its budget is spent; never slows the reading of messages.
export const positiveReplyCheck = defineJob({
   name: 'positive-reply-check',
   title: 'Unclear replies read by AI',
   purpose: 'Asks the AI once about each reply the word rules could not judge, and counts the ones that show interest.',
   everyMs: 2 * 60 * 1000,
   startAfterMs: 45_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const { read, counted, skipped, left } = await PositiveReplyService.checkWaiting()

      return read + skipped === 0
         ? undefined
         : {
              summary: `${read} unclear replies read, ${counted} counted as positive, ${skipped} given up, ${left} still waiting.`,
              counts: {
                 read,
                 counted,
                 skipped,
                 left,
              },
           }
   },
})
