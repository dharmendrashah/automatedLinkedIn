import { type ConfirmChannel, type ConsumeMessage } from 'amqplib'

import { DEAD_QUEUE_OPTIONS, deadQueueName } from './deadQueue'
import { type ConsumerDefinition, DEFAULT_PREFETCH, DEFAULT_RETRY } from './defineConsumer'

type Log = { info: (message: string) => void; error: (message: string) => void }

export type ConsumerState = {
   name: string
   queue: string
   connected: boolean
   lastHandledAt: string | null
   handled: number
   failed: number
   failureStreak: number
   deadLettered: number
}

export type RunnerOptions = {
   // A channel of its own that can also wait for the broker to take a republished copy.
   openChannel: () => Promise<ConfirmChannel>
   log?: Log
   reconnectMs?: number
}

export const RETRIES_HEADER = 'x-retries'
export const FAILURE_HEADER = 'x-failure'

const RECONNECT_MS = 5000
const MAX_REASON_LENGTH = 200

type Waiting = { timer: NodeJS.Timeout; resolve: () => void }

const readRetries = (message: ConsumeMessage) => {
   const value: unknown = message.properties.headers?.[RETRIES_HEADER]

   return typeof value === 'number' ? value : 0
}

// A connection that is refused arrives as an error without a message, so the name says what happened.
const reasonOf = (error: unknown) => (error instanceof Error ? error.message || error.name : 'unknown error')

// Runs one queue for the worker: takes messages, acknowledges after the handler finished, and on a failure retries by
// publishing a copy after a back-off (RabbitMQ gives no delay or limit to nack-with-requeue, so a failing message would
// spin). A message that cannot be parsed, or that used up its retries, goes to `<queue>.dead` and is acknowledged.
// It never throws: if the broker is down it keeps trying, so the worker can start before RabbitMQ does.
export class ConsumerRunner {
   private readonly definition: ConsumerDefinition

   private readonly options: RunnerOptions

   private readonly log: Log

   private readonly inFlight = new Set<Promise<void>>()

   private readonly waiting = new Set<Waiting>()

   private stopped = false

   private channel: ConfirmChannel | undefined

   private consumerTag: string | undefined

   private reconnect: NodeJS.Timeout | undefined

   private connected = false

   private handled = 0

   private failed = 0

   private failureStreak = 0

   private deadLettered = 0

   private lastHandledAt: string | null = null

   public constructor(definition: ConsumerDefinition, options: RunnerOptions) {
      this.definition = definition
      this.options = options
      this.log = options.log ?? console
   }

   public state(): ConsumerState {
      return {
         name: this.definition.name,
         queue: this.definition.queue,
         connected: this.connected,
         lastHandledAt: this.lastHandledAt,
         handled: this.handled,
         failed: this.failed,
         failureStreak: this.failureStreak,
         deadLettered: this.deadLettered,
      }
   }

   public async start() {
      const { definition } = this

      try {
         const channel = await this.options.openChannel()

         this.channel = channel
         channel.on('error', (error: Error) => this.log.error(`RabbitMQ channel error: ${error.message}`))
         channel.on('close', () => {
            if (this.channel === channel) {
               this.channel = undefined
               this.connected = false
               this.schedule()
            }
         })

         await definition.topology(channel)
         await channel.assertQueue(deadQueueName(definition.queue), DEAD_QUEUE_OPTIONS)
         await channel.prefetch(definition.prefetch ?? DEFAULT_PREFETCH)

         const { consumerTag } = await channel.consume(
            definition.queue,
            message => {
               if (message) {
                  this.track(this.handle(channel, message))
               }
            },
            { noAck: false }
         )

         this.consumerTag = consumerTag
         this.connected = true
      } catch (error) {
         this.log.error(`Could not consume ${definition.name}: ${reasonOf(error)}`)

         const failedChannel = this.channel

         // Forgotten first, so its close event does not schedule a second retry.
         this.channel = undefined
         await failedChannel?.close().catch(() => undefined)
         this.schedule()
      }
   }

   // Stops taking messages and waits up to `graceMs` for the ones being handled. A message waiting for its retry is left
   // unacknowledged, so the broker hands it out again.
   public async stop(graceMs: number) {
      const { channel, consumerTag } = this

      this.stopped = true
      clearTimeout(this.reconnect)

      for (const entry of this.waiting) {
         clearTimeout(entry.timer)
         entry.resolve()
      }

      this.waiting.clear()

      if (channel && consumerTag) {
         await channel.cancel(consumerTag).catch(() => undefined)
      }

      let timer: NodeJS.Timeout | undefined

      await Promise.race([
         Promise.allSettled([...this.inFlight]),
         new Promise<void>(resolve => {
            timer = setTimeout(resolve, graceMs)
         }),
      ])
      clearTimeout(timer)

      this.connected = false
      this.channel = undefined
      await channel?.close().catch(() => undefined)
   }

   private schedule() {
      // A channel that closes during start fails the start too; only one retry may be waiting.
      clearTimeout(this.reconnect)

      if (!this.stopped) {
         this.reconnect = setTimeout(() => void this.start(), this.options.reconnectMs ?? RECONNECT_MS)
      }
   }

   private track(work: Promise<void>) {
      const tracked: Promise<void> = work
         .catch((error: unknown) =>
            this.log.error(`Could not finish a ${this.definition.name} message: ${reasonOf(error)}`)
         )
         .finally(() => this.inFlight.delete(tracked))

      this.inFlight.add(tracked)
   }

   private async handle(channel: ConfirmChannel, message: ConsumeMessage) {
      const { definition } = this
      let item: unknown

      try {
         item = definition.parse(message.content.toString())
      } catch {
         // Never logged with its content: it may carry secrets, and it can never become valid.
         this.log.error(`Dropped a ${definition.name} message that does not match its contract`)
         await this.deadLetter(channel, message, 'does not match the contract')

         return
      }

      const label = definition.label(item)
      const startedAt = Date.now()

      try {
         await definition.handle(item)
      } catch (error) {
         this.failed += 1
         this.failureStreak += 1
         await this.retry(channel, message, label, reasonOf(error))

         return
      }

      this.handled += 1
      this.failureStreak = 0
      this.lastHandledAt = new Date().toISOString()
      this.log.info(`worker consumer=${definition.name} done in ${Date.now() - startedAt} ms: ${label}`)

      try {
         channel.ack(message)
      } catch {
         // The channel closed while this was handled; the broker delivers the message again.
      }
   }

   private async retry(channel: ConfirmChannel, message: ConsumeMessage, label: string, reason: string) {
      const { name, queue, retry = DEFAULT_RETRY } = this.definition
      const retries = readRetries(message)

      if (retries >= retry.max) {
         this.log.error(`worker consumer=${name} gave up after ${retries + 1} attempts: ${label}: ${reason}`)
         await this.deadLetter(channel, message, reason)

         return
      }

      this.log.error(`worker consumer=${name} will retry (${retries + 1} of ${retry.max}): ${label}: ${reason}`)

      const delayMs = retry.backoffMs[Math.min(retries, retry.backoffMs.length - 1)] ?? 0

      await this.later(delayMs, async () => {
         try {
            channel.sendToQueue(queue, message.content, {
               persistent: true,
               contentType: message.properties.contentType,
               messageId: message.properties.messageId,
               headers: {
                  ...message.properties.headers,
                  [RETRIES_HEADER]: retries + 1,
               },
            })
            await channel.waitForConfirms()
            channel.ack(message)
         } catch {
            // The copy may not have been published, so the original goes back rather than being lost.
            this.release(channel, message)
         }
      })
   }

   private async deadLetter(channel: ConfirmChannel, message: ConsumeMessage, reason: string) {
      try {
         channel.sendToQueue(deadQueueName(this.definition.queue), message.content, {
            persistent: true,
            contentType: message.properties.contentType,
            messageId: message.properties.messageId,
            headers: {
               ...message.properties.headers,
               [FAILURE_HEADER]: reason.slice(0, MAX_REASON_LENGTH),
            },
         })
         await channel.waitForConfirms()
         this.deadLettered += 1
         channel.ack(message)
      } catch {
         this.release(channel, message)
      }
   }

   private release(channel: ConfirmChannel, message: ConsumeMessage) {
      try {
         channel.nack(message, false, true)
      } catch {
         // The channel is gone, which returns the message to the queue anyway.
      }
   }

   // Waits `delayMs`, unless the runner stops first, and then runs `run`.
   private later(delayMs: number, run: () => Promise<void>) {
      return new Promise<void>(resolve => {
         const entry: Waiting = {
            resolve,
            timer: setTimeout(() => {
               this.waiting.delete(entry)
               void run().finally(resolve)
            }, delayMs),
         }

         this.waiting.add(entry)
      })
   }
}
