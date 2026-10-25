export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type Options<T> = {
   save: (value: T) => Promise<void>
   // How long the edits must be quiet before a save is sent.
   delay: number
   onState: (state: SaveState) => void
}

// Saves what the owner types without sending every key: after a quiet moment, one save at a time, and only the newest value of
// what came while one was running, so a slow earlier save can never overwrite a later one. A failed value is kept for `retry`.
export const createSaveQueue = <T>({ save: first, delay, onState }: Options<T>) => {
   let save = first
   let pending: { value: T } | undefined
   let timer: ReturnType<typeof setTimeout> | undefined
   let inflight: Promise<void> | undefined

   const drain = async () => {
      while (pending) {
         const { value } = pending

         pending = undefined

         try {
            await save(value)
         } catch {
            pending ??= { value }
            onState('error')

            return
         }
      }

      onState('saved')
   }

   const run = () => {
      inflight ??= drain().finally(() => {
         inflight = undefined
      })

      return inflight
   }

   return {
      // The next save sends with this function, so a page can keep handing over its newest one.
      use: (next: (value: T) => Promise<void>) => {
         save = next
      },
      push: (value: T) => {
         pending = { value }
         onState('saving')
         clearTimeout(timer)
         timer = setTimeout(() => void run(), delay)
      },
      flush: () => {
         clearTimeout(timer)

         return pending || inflight ? run() : Promise.resolve()
      },
      retry: () => {
         if (pending) {
            onState('saving')
         }

         return run()
      },
      cancel: () => {
         clearTimeout(timer)
         pending = undefined
      },
   }
}
