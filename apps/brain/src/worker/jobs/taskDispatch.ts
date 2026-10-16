import { TaskDispatchService } from 'database'

import { defineJob } from './defineJob'

// Publishes the tasks that were accepted but did not reach RabbitMQ when they were saved, and ends the ones that waited
// too long (.plan/task-outbox.md). A table with nothing to do writes no log line.
export const taskDispatch = defineJob({
   name: 'task-dispatch',
   everyMs: 10_000,
   startAfterMs: 15_000,
   timeoutMs: 2 * 60 * 1000,
   run: async ({ signal }) => {
      const { published, gaveUp } = await TaskDispatchService.dispatchDue(signal)

      return published > 0 || gaveUp > 0 ? { summary: `${published} published, ${gaveUp} given up` } : undefined
   },
})
