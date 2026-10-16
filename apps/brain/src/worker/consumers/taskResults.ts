import { TaskService } from 'database'

import { TASK_DONE_QUEUE, assertAccountTopology, taskResultSchema } from '@automatedLinkedIn/contracts'

import { defineConsumer } from './defineConsumer'

// What the spider answered for a task: finish its session, with the brain side effects of that task, in one transaction.
// Idempotent: a repeated or late answer finishes nothing.
export const taskResults = defineConsumer({
   name: 'task-results',
   queue: TASK_DONE_QUEUE,
   topology: assertAccountTopology,
   parse: content => taskResultSchema.parse(JSON.parse(content)),
   label: result => `${result.task} ${result.task_id}`,
   handle: async result => {
      await TaskService.applyResult(result)
   },
})
