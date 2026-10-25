import type { PostDraftInput } from '@automatedLinkedIn/contracts'
import { useEffect, useState } from 'react'

import { type SaveState, createSaveQueue } from './save-queue'

export type DraftValue = {
   // No words and no attachment: such a draft is never created, but an existing one is still saved when it is emptied.
   blank: boolean
   input: Omit<PostDraftInput, 'id'>
}

// Sends the draft to brain a moment after the owner stops typing, and once more when the page is left. `save` is the latest one
// the page gave, so it always uses the draft id the page knows by then.
export const useAutosave = (save: (value: DraftValue) => Promise<void>) => {
   const [state, setState] = useState<SaveState>('idle')
   const [queue] = useState(() =>
      createSaveQueue<DraftValue>({
         save,
         delay: 800,
         onState: setState,
      })
   )

   useEffect(() => {
      queue.use(save)
   })

   useEffect(
      () => () => {
         void queue.flush()
      },
      [queue]
   )

   return {
      state,
      push: queue.push,
      retry: queue.retry,
      flush: queue.flush,
   }
}
