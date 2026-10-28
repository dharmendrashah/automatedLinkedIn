import { type ChannelModel, type ConfirmChannel, connect } from 'amqplib'

import { RABBITMQ_URL } from 'env'

import { assertAccountTopology } from '@automatedLinkedIn/contracts'

// How long an unreachable broker may stall a caller, such as the /health probe.
const CONNECT_TIMEOUT_MS = 3000

export class MessageBroker {
   private static pending?: Promise<ChannelModel>

   private static open?: ChannelModel

   private static publisher?: Promise<ConfirmChannel>

   // One shared connection, opened on first use and opened again after it drops.
   public static connection() {
      this.pending ??= connect(RABBITMQ_URL, { timeout: CONNECT_TIMEOUT_MS })
         .then(connection => {
            this.open = connection

            // Without an error listener an emitted 'error' would crash the process.
            connection.on('error', (error: Error) => console.error(`RabbitMQ connection error: ${error.message}`))
            connection.on('close', () => {
               this.pending = undefined
               this.open = undefined
               this.publisher = undefined
            })

            return connection
         })
         .catch((error: unknown) => {
            this.pending = undefined

            throw error
         })

      return this.pending
   }

   // One shared channel for publishing. `waitForConfirms()` resolves once the broker has the message.
   public static confirmChannel() {
      this.publisher ??= this.connection()
         .then(connection => connection.createConfirmChannel())
         .then(channel => {
            channel.on('error', (error: Error) => console.error(`RabbitMQ channel error: ${error.message}`))
            channel.on('close', () => {
               this.publisher = undefined
            })

            return channel
         })
         .catch((error: unknown) => {
            this.publisher = undefined

            throw error
         })

      return this.publisher
   }

   // A channel of its own, for a consumer that must not share a prefetch with anything else.
   public static async channel() {
      return (await this.connection()).createChannel()
   }

   // Messages waiting in a queue, not counting the ones a consumer holds. A failed check closes its channel, so it gets one of its own.
   public static async readyCount(queue: string) {
      const channel = await this.channel()

      try {
         await assertAccountTopology(channel)

         const { messageCount } = await channel.checkQueue(queue)

         return messageCount
      } finally {
         try {
            await channel.close()
         } catch {
            // Already closed by a failed check; nothing left to release.
         }
      }
   }

   // Like `channel()`, but a consumer can also republish and wait until the broker has the copy.
   public static async confirmedChannel() {
      return (await this.connection()).createConfirmChannel()
   }

   public static async isHealthy() {
      let timer: NodeJS.Timeout | undefined

      try {
         await Promise.race([
            this.connection(),
            new Promise<never>((_, reject) => {
               timer = setTimeout(() => reject(new Error('RabbitMQ connect timed out')), CONNECT_TIMEOUT_MS)
            }),
         ])

         return true
      } catch {
         return false
      } finally {
         clearTimeout(timer)
      }
   }

   // Never waits for a connect that is still pending, so shutdown cannot hang on an unreachable broker.
   public static async disconnect() {
      const { open } = this

      this.pending = undefined
      this.open = undefined
      this.publisher = undefined

      try {
         await open?.close()
      } catch {
         // Already closed or dropped; nothing left to release.
      }
   }
}
