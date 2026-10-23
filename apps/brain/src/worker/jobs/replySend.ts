import { LinkedInReplyService } from 'database'

import { defineJob } from './defineJob'

// Gives each account with a queued reply its turn (one at a time, 30 seconds apart) and ends the replies that waited too long
// (.plan/reply-queue.md). A table with nothing queued writes no log line.
export const replySend = defineJob({
   name: 'reply-send',
   title: 'Reply queue',
   purpose:
      'Sends the replies that were asked for while the account was busy, one at a time and in order, and ends the ones that could not start in time.',
   everyMs: 10_000,
   startAfterMs: 20_000,
   timeoutMs: 2 * 60 * 1000,
   run: async () => {
      const { started, expired } = await LinkedInReplyService.dispatchWaiting()

      return started > 0 || expired > 0
         ? {
              summary: `${started} queued replies started, ${expired} could not start in time`,
              counts: {
                 started,
                 expired,
              },
           }
         : undefined
   },
})
