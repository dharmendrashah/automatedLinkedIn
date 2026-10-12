import {
   EXCHANGE,
   TASK_CATALOG_QUEUE,
   TASK_DONE_QUEUE,
   TASK_KEY,
   type TaskCatalog,
   type TaskCommand,
   type TaskResult,
   assertAccountTopology,
   taskCatalogSchema,
   taskCommandSchema,
   taskResultSchema,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'
import { consumeResults } from './resultConsumer'

type Log = { error: (message: string) => void }

// The conversation with the worker about every task (.plan/spider-task-framework.md): brain asks, the worker answers, and
// announces which tasks it can run.
export class TaskQueue {
   // Resolves once the broker has taken the message, so a caller can tell a lost publish from a delivered one.
   public static async publish(command: TaskCommand) {
      const valid = taskCommandSchema.parse(command)
      const channel = await MessageBroker.confirmChannel()

      await assertAccountTopology(channel)

      channel.publish(EXCHANGE, TASK_KEY, Buffer.from(JSON.stringify(valid)), {
         persistent: true,
         contentType: 'application/json',
         messageId: valid.task_id,
      })

      await channel.waitForConfirms()
   }

   public static consumeResults(handler: (result: TaskResult) => Promise<void>, log: Log = console) {
      return consumeResults(
         {
            queue: TASK_DONE_QUEUE,
            noun: 'task',
            parse: content => taskResultSchema.parse(JSON.parse(content)),
         },
         handler,
         log
      )
   }

   public static consumeCatalog(handler: (catalog: TaskCatalog) => Promise<void>, log: Log = console) {
      return consumeResults(
         {
            queue: TASK_CATALOG_QUEUE,
            noun: 'task catalog',
            parse: content => taskCatalogSchema.parse(JSON.parse(content)),
         },
         handler,
         log
      )
   }
}
