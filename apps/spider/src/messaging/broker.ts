import { type ChannelModel, type ConfirmChannel, connect } from 'amqplib'

// How long an unreachable broker may stall a caller, such as the /health probe.
const CONNECT_TIMEOUT_MS = 3000

// One shared connection, opened on first use and opened again after it drops.
export class Broker {
   private pending?: Promise<ChannelModel>

   private open?: ChannelModel

   private publishing?: Promise<ConfirmChannel>

   public constructor(
      private readonly url: string,
      private readonly connectFn: typeof connect = connect
   ) {}

   public connection() {
      this.pending ??= this.connectFn(this.url, { timeout: CONNECT_TIMEOUT_MS })
         .then(connection => {
            this.open = connection

            // Without an error listener an emitted 'error' would crash the process.
            connection.on('error', (error: Error) => console.error(`RabbitMQ connection error: ${error.message}`))
            connection.on('close', () => {
               this.pending = undefined
               this.open = undefined
               this.publishing = undefined
            })

            return connection
         })
         .catch((error: unknown) => {
            this.pending = undefined

            throw error
         })

      return this.pending
   }

   // Publisher confirms: a publish resolves only once the broker has accepted the message.
   public publishChannel() {
      this.publishing ??= this.connection()
         .then(connection => connection.createConfirmChannel())
         .then(channel => {
            channel.on('error', (error: Error) => console.error(`RabbitMQ channel error: ${error.message}`))
            channel.on('close', () => {
               this.publishing = undefined
            })

            return channel
         })
         .catch((error: unknown) => {
            this.publishing = undefined

            throw error
         })

      return this.publishing
   }

   public async consumeChannel() {
      const channel = await (await this.connection()).createChannel()

      channel.on('error', (error: Error) => console.error(`RabbitMQ channel error: ${error.message}`))

      return channel
   }

   public async isHealthy() {
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
   public async close() {
      const { open } = this

      this.pending = undefined
      this.open = undefined
      this.publishing = undefined

      try {
         await open?.close()
      } catch {
         // Already closed or dropped; nothing left to release.
      }
   }
}
