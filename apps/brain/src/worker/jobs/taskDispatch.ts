import { CloudRunJob } from 'core'

import { TaskDispatchService } from 'database'

import { defineJob } from './defineJob'

// Publishes the tasks that were accepted but did not reach RabbitMQ when they were saved, ends the ones that waited too long
// (.plan/task-outbox.md), and starts the spider jobs the waiting tasks need (.plan/spider-worker-cloud-run.md). A table with
// nothing to do writes no log line.
export const taskDispatch = defineJob({
   name: 'task-dispatch',
   title: 'Task publishing',
   purpose:
      'Sends the LinkedIn tasks that were accepted but did not reach the queue yet, ends the ones that waited too long, and starts the spider jobs they need.',
   everyMs: 10_000,
   startAfterMs: 15_000,
   timeoutMs: 2 * 60 * 1000,
   run: async ({ signal }) => {
      const { published, gaveUp } = await TaskDispatchService.dispatchDue(signal)
      const { started } = await CloudRunJob.start()

      return published > 0 || gaveUp > 0 || started > 0
         ? {
              summary: `${published} published, ${gaveUp} given up, ${started} spider job(s) started`,
              counts: {
                 published,
                 gaveUp,
                 started,
              },
           }
         : undefined
   },
})
