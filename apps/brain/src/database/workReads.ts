import { DataReadService, type ReadClient } from './dataRead.service'

// Plays the worker in tests: moves the owner's queued reads until none is due now.
export const workReads = async (userId: string, client: ReadClient) => {
   for (let pass = 0; pass < 5; pass += 1) {
      const due = (await DataReadService.due()).filter(read => read.userId === userId)

      if (due.length === 0) {
         return
      }

      for (const read of due) {
         if (await DataReadService.claim(read)) {
            await DataReadService.advance(read, client, { error: () => undefined })
         }
      }
   }
}
