import {
   EXCHANGE,
   VALIDATED_QUEUE,
   VALIDATE_KEY,
   type ValidateAccountCommand,
   type ValidateAccountResult,
   assertAccountTopology,
   validateAccountCommandSchema,
   validateAccountResultSchema,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'
import { consumeResults } from './resultConsumer'

type Log = { error: (message: string) => void }

// The conversation with the worker that checks LinkedIn credentials: brain asks, the worker answers.
export class AccountValidationQueue {
   // Resolves once the broker has taken the message, so a caller can tell a lost publish from a delivered one.
   public static async publish(command: ValidateAccountCommand) {
      const valid = validateAccountCommandSchema.parse(command)
      const channel = await MessageBroker.confirmChannel()

      await assertAccountTopology(channel)

      channel.publish(EXCHANGE, VALIDATE_KEY, Buffer.from(JSON.stringify(valid)), {
         persistent: true,
         contentType: 'application/json',
         messageId: valid.validation_id,
      })

      await channel.waitForConfirms()
   }

   // The worker's answers, one after another. It never throws: if the broker is down, it keeps trying.
   public static consume(handler: (result: ValidateAccountResult) => Promise<void>, log: Log = console) {
      return consumeResults(
         {
            queue: VALIDATED_QUEUE,
            noun: 'validation',
            parse: content => validateAccountResultSchema.parse(JSON.parse(content)),
         },
         handler,
         log
      )
   }
}
