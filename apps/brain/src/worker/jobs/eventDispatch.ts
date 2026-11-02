import { EventDispatchService, HookService } from 'database'

import { defineJob } from './defineJob'

// Takes task events to the workflows that listen to them, and starts the event runs whose turn has come (.plan/workflow-events-and-hooks.md).
// Idle passes write nothing.
export const eventDispatch = defineJob({
   name: 'event-dispatch',
   title: 'Task events',
   purpose:
      'Matches what the accounts did (a task before it starts, while it works and when it finishes) to the workflows that listen, and starts their runs, a few at a time.',
   everyMs: 10_000,
   startAfterMs: 15_000,
   timeoutMs: 2 * 60 * 1000,
   run: async () => {
      const fanned = await EventDispatchService.fanOut()
      const started = await EventDispatchService.start()
      const hooks = await HookService.startDue()
      const items = [...fanned.items, ...started.items, ...hooks.items]

      if (items.length === 0 && fanned.events === 0) {
         return undefined
      }

      const runs = started.started + hooks.started

      return {
         ...(runs > 0 && { summary: `${runs} runs started by events and hooks` }),
         counts: {
            events: fanned.events,
            deliveries: fanned.deliveries,
            started: started.started,
            hooks: hooks.started,
         },
         items,
      }
   },
})
