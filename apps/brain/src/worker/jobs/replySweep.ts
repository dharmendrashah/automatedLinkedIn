import { LinkedInReplyService } from 'database'

import { defineJob } from './defineJob'

// Ends the replies whose run was lost as unsure (.plan/unibox-send.md). A table with nothing to do writes no log line.
export const replySweep = defineJob({
   name: 'reply-sweep',
   everyMs: 60_000,
   startAfterMs: 30_000,
   timeoutMs: 30_000,
   run: async () => {
      const ended = await LinkedInReplyService.endStale()

      return ended > 0 ? { summary: `${ended} replies ended as unsure` } : undefined
   },
})
