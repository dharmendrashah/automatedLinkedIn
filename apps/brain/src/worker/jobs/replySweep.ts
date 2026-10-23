import { LinkedInReplyService } from 'database'

import { defineJob } from './defineJob'

// Ends the replies whose run was lost as unsure and moves the files of replies that ended to their permanent place (.plan/unibox-send.md, .plan/unibox-keep-messages-and-files.md). A table with nothing to do writes no log line.
export const replySweep = defineJob({
   name: 'reply-sweep',
   title: 'Reply clean-up',
   purpose:
      'Ends replies whose send was lost as unsure and moves the files of finished replies to their permanent place.',
   everyMs: 60_000,
   startAfterMs: 30_000,
   timeoutMs: 30_000,
   run: async () => {
      const ended = await LinkedInReplyService.endStale()
      const kept = await LinkedInReplyService.keepFiles()

      return ended + kept > 0
         ? {
              summary: `${ended} replies ended as unsure, the files of ${kept} replies kept`,
              counts: {
                 ended,
                 kept,
              },
           }
         : undefined
   },
})
