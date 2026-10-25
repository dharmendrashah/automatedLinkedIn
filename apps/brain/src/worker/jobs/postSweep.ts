import { PostPublicationService } from 'database'

import { defineJob } from './defineJob'

// Ends the posts whose run was lost as unsure, and deletes the files of posts that went, since LinkedIn holds them now
// (.plan/posting-send-task.md, Q3). A table with nothing to do writes no log line.
export const postSweep = defineJob({
   name: 'post-sweep',
   title: 'Post clean-up',
   purpose: 'Ends posts whose send was lost as unsure and deletes the uploaded files of posts that went.',
   everyMs: 60_000,
   startAfterMs: 35_000,
   timeoutMs: 30_000,
   run: async () => {
      const ended = await PostPublicationService.endStale()
      const deleted = await PostPublicationService.deleteFiles()

      return ended + deleted > 0
         ? {
              summary: `${ended} posts ended as unsure, the files of ${deleted} posts deleted`,
              counts: {
                 ended,
                 deleted,
              },
           }
         : undefined
   },
})
