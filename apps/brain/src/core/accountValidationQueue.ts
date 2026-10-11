import { type Channel, type ConsumeMessage } from 'amqplib'

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

type Log = { error: (message: string) => void }

const RECONNECT_MS = 5000

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

   // Takes results one after another and acknowledges each after `handler` finished. It never throws: if the
   // broker is down, it keeps trying, so brain can start before RabbitMQ does.
   public static async consume(handler: (result: ValidateAccountResult) => Promise<void>, log: Log = console) {
      let stopped = false
      let current: Channel | undefined
      let timer: NodeJS.Timeout | undefined

      const handle = async (channel: Channel, message: ConsumeMessage) => {
         let result: ValidateAccountResult

         try {
            result = validateAccountResultSchema.parse(JSON.parse(message.content.toString()))
         } catch {
            // Never logged with its content, and it can never become valid.
            log.error('Dropped a validation result that does not match the contract')
            channel.nack(message, false, false)

            return
         }

         try {
            await handler(result)
            channel.ack(message)
         } catch (error) {
            const reason = error instanceof Error ? error.message : 'unknown error'

            // One more try for a short database outage; after that the owner can verify again.
            log.error(`Could not apply a validation result${message.fields.redelivered ? ', dropped' : ''}: ${reason}`)
            channel.nack(message, false, !message.fields.redelivered)
         }
      }

      const schedule = () => {
         // A channel that closes during start fails the start too; only one retry may be waiting.
         clearTimeout(timer)

         if (!stopped) {
            timer = setTimeout(() => void start(), RECONNECT_MS)
         }
      }

      const start = async () => {
         try {
            const channel = await MessageBroker.channel()

            current = channel
            channel.on('error', (error: Error) => log.error(`RabbitMQ channel error: ${error.message}`))
            channel.on('close', () => {
               current = undefined
               schedule()
            })

            await assertAccountTopology(channel)
            await channel.prefetch(10)
            await channel.consume(
               VALIDATED_QUEUE,
               message => {
                  if (message) {
                     return handle(channel, message)
                  }
               },
               { noAck: false }
            )
         } catch (error) {
            log.error(
               `Could not consume validation results: ${error instanceof Error ? error.message : 'unknown error'}`
            )
            schedule()
         }
      }

      await start()

      return {
         stop: async () => {
            stopped = true
            clearTimeout(timer)
            await current?.close().catch(() => undefined)
         },
      }
   }
}
