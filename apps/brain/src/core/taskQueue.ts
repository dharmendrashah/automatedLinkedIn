import {
   EXCHANGE,
   TASK_KEY,
   type TaskCommand,
   assertAccountTopology,
   taskCommandSchema,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'

// Brain's half of the conversation with the worker about every task (.plan/spider-task-framework.md): it asks. The answers
// and the catalog of tasks are consumed by the brain worker (src/worker).
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
}
