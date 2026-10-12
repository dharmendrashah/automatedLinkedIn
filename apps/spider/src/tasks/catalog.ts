import { toJSONSchema } from 'zod'

import { TASK_CONTRACT_VERSION, type TaskCatalog, type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { type TaskDefinition } from './defineTask'

export const catalogEntryOf = (task: TaskDefinition): TaskCatalogEntry => ({
   contract: TASK_CONTRACT_VERSION,
   task: task.name,
   version: task.version,
   title: task.title,
   description: task.description,
   input_schema: toJSONSchema(task.input) as Record<string, unknown>,
   needs: task.needs,
   verdicts: task.verdicts,
   policy: {
      cooldown_ms: task.policy.cooldownMs,
      one_at_a_time: task.policy.oneAtATime,
      ...(task.policy.automatic && {
         automatic: task.policy.automatic.map(({ on, everyMs }) => ({
            on,
            every_ms: everyMs,
         })),
      }),
   },
   ...(task.retryOn && { retry_on: task.retryOn }),
   hosts: task.hosts,
})

// What the worker announces at start: every task it can run, in one message.
export const catalogOf = (tasks: TaskDefinition[], build: string, now = new Date()): TaskCatalog => ({
   contract: TASK_CONTRACT_VERSION,
   announced_at: now.toISOString(),
   worker: { build },
   tasks: tasks.map(catalogEntryOf),
})
