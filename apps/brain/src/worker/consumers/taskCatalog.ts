import { TaskService } from 'database'

import {
   TASK_CATALOG_QUEUE,
   type TaskCatalog,
   assertAccountTopology,
   taskCatalogSchema,
} from '@automatedLinkedIn/contracts'

import { defineConsumer } from './defineConsumer'

// The queue keeps one message and drops its head, so a retry copy of an old catalog could land after a newer one. An older
// catalog than the newest applied is therefore ignored.
export const catalogHandler = (apply: (catalog: TaskCatalog) => Promise<void> = c => TaskService.applyCatalog(c)) => {
   let newest = 0

   return async (catalog: TaskCatalog) => {
      const announced = Date.parse(catalog.announced_at)

      if (announced < newest) {
         return
      }

      await apply(catalog)
      newest = announced
   }
}

// The tasks the spider worker can run, announced when it starts.
export const taskCatalog = defineConsumer({
   name: 'task-catalog',
   queue: TASK_CATALOG_QUEUE,
   topology: assertAccountTopology,
   parse: content => taskCatalogSchema.parse(JSON.parse(content)),
   label: catalog => `${catalog.tasks.length} task(s) from build ${catalog.worker.build}`,
   handle: catalogHandler(),
})
