import { DataReadService } from 'database'

import { dataClient } from '../data/client'
import { defineJob } from './defineJob'

// Moves the reads owners queued in a drawer one step each (start, look, retry, keep), so none waits on another.
export const dataReads = defineJob({
   name: 'data-reads',
   everyMs: 5_000,
   startAfterMs: 10_000,
   timeoutMs: 5 * 60 * 1000,
   run: async ({ signal }) => {
      let ended = 0

      for (const read of await DataReadService.due()) {
         if (signal.aborted) {
            break
         }

         if ((await DataReadService.claim(read)) && (await DataReadService.advance(read, dataClient, console))) {
            ended += 1
         }
      }

      return ended > 0 ? { summary: `${ended} reads ended` } : undefined
   },
})
