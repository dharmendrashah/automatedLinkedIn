import { TaskEventService } from 'database'

import { TASK_STARTED_QUEUE, assertAccountTopology, taskStartedSchema } from '@automatedLinkedIn/contracts'

import { defineConsumer } from './defineConsumer'

// The worker really began a task: keep the time and write its "on" event. A repeated message changes nothing, and one that comes after
// the result or for an unknown session is dropped.
export const taskStarted = defineConsumer({
   name: 'task-started',
   queue: TASK_STARTED_QUEUE,
   topology: assertAccountTopology,
   parse: content => taskStartedSchema.parse(JSON.parse(content)),
   label: started => `${started.task} ${started.task_id}`,
   handle: async started => {
      await TaskEventService.began(started.task_id, new Date(started.started_at))
   },
})
