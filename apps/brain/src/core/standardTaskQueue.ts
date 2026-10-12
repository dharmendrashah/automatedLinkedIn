import {
   EXCHANGE,
   STANDARD_DONE_QUEUE,
   STANDARD_KEY,
   type StandardTaskCommand,
   type StandardTaskResult,
   assertAccountTopology,
   standardTaskCommandSchema,
   standardTaskResultSchema,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'
import { consumeResults } from './resultConsumer'

type Log = { error: (message: string) => void }

// The conversation with the worker about standard tasks (jobs that need no LinkedIn account): brain asks, the worker answers.
export class StandardTaskQueue {
   // Resolves once the broker has taken the message, so a caller can tell a lost publish from a delivered one.
   public static async publish(command: StandardTaskCommand) {
      const valid = standardTaskCommandSchema.parse(command)
      const channel = await MessageBroker.confirmChannel()

      await assertAccountTopology(channel)

      channel.publish(EXCHANGE, STANDARD_KEY, Buffer.from(JSON.stringify(valid)), {
         persistent: true,
         contentType: 'application/json',
         messageId: valid.task_id,
      })

      await channel.waitForConfirms()
   }

   public static consume(handler: (result: StandardTaskResult) => Promise<void>, log: Log = console) {
      return consumeResults(
         {
            queue: STANDARD_DONE_QUEUE,
            noun: 'standard task',
            parse: content => standardTaskResultSchema.parse(JSON.parse(content)),
         },
         handler,
         log
      )
   }
}
