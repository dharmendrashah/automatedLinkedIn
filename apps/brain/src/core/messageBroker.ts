import { type ChannelModel, connect } from 'amqplib'

import { RABBITMQ_URL } from 'env'

// How long an unreachable broker may stall a caller, such as the /health probe.
const CONNECT_TIMEOUT_MS = 3000

export class MessageBroker {
   private static pending?: Promise<ChannelModel>

   private static open?: ChannelModel

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
            })

            return connection
         })
         .catch((error: unknown) => {
            this.pending = undefined

            throw error
         })

      return this.pending
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

      try {
         await open?.close()
      } catch {
         // Already closed or dropped; nothing left to release.
      }
   }
}
