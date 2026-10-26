import { PostPublicationService } from 'database'

import { defineJob } from './defineJob'

// Queues the planned posts that are due, gives each account with a queued post its turn (one at a time, an hour apart) and ends the
// posts that are an hour past their time without having started (.plan/posting-send-task.md). A table with nothing to do writes no log line.
export const postSend = defineJob({
   name: 'post-send',
   title: 'Post queue',
   purpose:
      'Starts the posts that were planned for now or asked for while the account was busy, one at a time and in order, and ends the ones that could not start in time.',
   everyMs: 10_000,
   startAfterMs: 25_000,
   timeoutMs: 2 * 60 * 1000,
   run: async () => {
      const { started, due, expired } = await PostPublicationService.dispatchDue()

      return started > 0 || due > 0 || expired > 0
         ? {
              summary: `${due} planned posts came due, ${started} post started, ${expired} could not start in time`,
              counts: {
                 due,
                 started,
                 expired,
              },
           }
         : undefined
   },
})
