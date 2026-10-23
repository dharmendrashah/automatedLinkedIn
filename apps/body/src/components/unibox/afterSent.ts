import { type UniboxSource } from './source'

const sleep = (ms: number) =>
   new Promise<void>(resolve => {
      setTimeout(resolve, ms)
   })

// After LinkedIn took a reply its message is stored by the next import (the job runs every 30 seconds). The conversation is read again
// every 4 seconds until it holds more messages than before, for about 90 seconds at most; resolves to it, or to nothing when it did
// not come in that time. `wait`, `tries` and `gap` are only for tests.
export const waitForStored = async (
   source: Pick<UniboxSource, 'open'>,
   id: string,
   before: number,
   { wait = sleep, tries = 22, gap = 4000 }: { wait?: (ms: number) => Promise<void>; tries?: number; gap?: number } = {}
) => {
   for (let attempt = 0; attempt < tries; attempt += 1) {
      await wait(gap)

      const conversation = await source.open(id).catch(() => undefined)

      if (conversation && (conversation.messageCount ?? conversation.messages.length) > before) {
         return conversation
      }
   }

   return undefined
}
