import { type Channel, type ConsumeMessage } from 'amqplib'

import { assertAccountTopology } from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'

type Log = { error: (message: string) => void }

type ResultQueueOptions<T> = {
   queue: string
   // Names what the queue carries in log lines, for example "validation".
   noun: string
   parse: (content: string) => T
   // What to declare before consuming; the account and task queues unless a queue of another kind says otherwise.
   topology?: (channel: Channel) => Promise<unknown>
}

const RECONNECT_MS = 5000

// Takes the worker's answers from `queue` one after another and acknowledges each after `handler` finished. It never
// throws: if the broker is down, it keeps trying, so brain can start before RabbitMQ does.
export const consumeResults = async <T>(
   { queue, noun, parse, topology = assertAccountTopology }: ResultQueueOptions<T>,
   handler: (result: T) => Promise<void>,
   log: Log
) => {
   let stopped = false
   let current: Channel | undefined
   let timer: NodeJS.Timeout | undefined

   const handle = async (channel: Channel, message: ConsumeMessage) => {
      let result: T

      try {
         result = parse(message.content.toString())
      } catch {
         // Never logged with its content, and it can never become valid.
         log.error(`Dropped a ${noun} result that does not match the contract`)
         channel.nack(message, false, false)

         return
      }

      try {
         await handler(result)
         channel.ack(message)
      } catch (error) {
         const reason = error instanceof Error ? error.message : 'unknown error'

         // One more try for a short database outage; after that the owner can ask again.
         log.error(`Could not apply a ${noun} result${message.fields.redelivered ? ', dropped' : ''}: ${reason}`)
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

         await topology(channel)
         await channel.prefetch(10)
         await channel.consume(
            queue,
            message => {
               if (message) {
                  return handle(channel, message)
               }
            },
            { noAck: false }
         )
      } catch (error) {
         log.error(`Could not consume ${noun} results: ${error instanceof Error ? error.message : 'unknown error'}`)
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
