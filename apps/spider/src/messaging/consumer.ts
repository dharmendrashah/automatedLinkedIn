import { type Channel, type Message } from 'amqplib'

import { type ScrapeTaskCommand } from '../types'

import { AccountBusyError, ShutdownError } from '../scraping/errors'
import { parseCommand } from '../types/schema'
import { TASK_QUEUE } from './topology'

export type TaskHandler = (command: ScrapeTaskCommand) => Promise<void>

type Log = { info: (message: string) => void; error: (message: string) => void }

export type ConsumerOptions = {
   // Publishes a copy of the message with its retry counter set to `retries`.
   republish: (message: Message, retries: number) => Promise<void>
   log?: Log
   sleep?: (ms: number) => Promise<void>
   backoffMs?: number[]
   // How long a task waits before it is tried again because another task holds its account.
   busyDelayMs?: number
   // How often a job that is still running (or waiting for its account) writes a line to the log.
   heartbeatMs?: number
   now?: () => number
}

export const RETRIES_HEADER = 'x-retries'

// A task that keeps failing is retried this many times, then dead-lettered.
export const MAX_RETRIES = 3

const BACKOFF_MS = [5_000, 30_000, 120_000]

const BUSY_DELAY_MS = 10_000

// Job lines tell the idle checker that a job is running. A long job writes a heartbeat so it is not
// mistaken for idle work. Only real jobs write these lines, not the polling of an empty queue.
const HEARTBEAT_MS = 60_000

const readRetries = (message: Message) => {
   const value: unknown = message.properties.headers?.[RETRIES_HEADER]

   return typeof value === 'number' ? value : 0
}

// What one queue needs on top of the shared retry logic.
export type QueueSpec<T> = {
   queue: string
   // Turns a message body into an item. It throws when the body is not valid.
   parse: (content: Buffer) => T
   // Names an item in the log. Never includes a secret.
   label: (item: T) => string
   handler: (item: T) => Promise<void>
   // When set, an item that used up its retries is handed to this (to report the failure) and acknowledged,
   // instead of going to the dead-letter queue.
   onExhausted?: (item: T, reason: string) => Promise<void>
}

type ConsumerChannel = Pick<Channel, 'prefetch' | 'consume' | 'cancel' | 'ack' | 'nack'>

type HandlerChannel = Pick<Channel, 'ack' | 'nack'>

type OnceChannel = HandlerChannel & Pick<Channel, 'get'>

// Runs one message through the queue's rules. The handler is acknowledged only after it has finished, so a crash
// mid-task makes the broker deliver it again.
//
// RabbitMQ gives no delay or limit to nack-with-requeue (a failing task would spin), so a failure is
// retried by publishing a copy with a counter after a back-off. While it waits, this worker takes no
// other message, which is the same as running one task at a time.
const createHandler = <T>(
   channel: HandlerChannel,
   { parse, label, handler, onExhausted }: QueueSpec<T>,
   {
      republish,
      log = console,
      sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
      backoffMs = BACKOFF_MS,
      busyDelayMs = BUSY_DELAY_MS,
      heartbeatMs = HEARTBEAT_MS,
      now = Date.now,
   }: ConsumerOptions
) => {
   // Jobs waiting for their account, with when their waiting line was last logged.
   const waiting = new Map<string, number>()

   const logWaiting = (name: string) => {
      const last = waiting.get(name)

      if (last === undefined || now() - last >= heartbeatMs) {
         log.info(`spider job waiting: ${name} (its account is in use)`)
         waiting.set(name, now())
      }
   }

   // Publishes a copy after a wait, then drops the original. If the copy cannot be published the original goes
   // back to the queue rather than being lost.
   const requeue = async (message: Message, delayMs: number, retries: number) => {
      try {
         await sleep(delayMs)
         await republish(message, retries)
         channel.ack(message)
      } catch {
         channel.nack(message, false, true)
      }
   }

   const giveUp = async (message: Message, item: T, reason: string) => {
      if (!onExhausted) {
         channel.nack(message, false, false)

         return
      }

      try {
         await onExhausted(item, reason)
         channel.ack(message)
      } catch {
         channel.nack(message, false, true)
      }
   }

   const retry = async (message: Message, item: T, reason: string) => {
      const retries = readRetries(message)

      if (retries >= MAX_RETRIES) {
         log.error(`${label(item)} failed ${retries + 1} times and is given up: ${reason}`)
         await giveUp(message, item, reason)

         return
      }

      log.error(`${label(item)} will be retried (${retries + 1} of ${MAX_RETRIES}): ${reason}`)

      await requeue(message, backoffMs[retries] ?? backoffMs[backoffMs.length - 1], retries + 1)
   }

   // Runs the handler and writes the job lines around it. The heartbeat stops as soon as the handler returns,
   // so a retry or a wait does not look like a running job.
   const runJob = async (item: T): Promise<{ ok: true } | { ok: false; error: unknown }> => {
      const name = label(item)
      if (!waiting.has(name)) {
         log.info(`spider job started: ${name}`)
      }
      const heartbeat = setInterval(() => log.info(`spider job still running: ${name}`), heartbeatMs)

      try {
         await handler(item)

         return { ok: true }
      } catch (error) {
         return {
            ok: false,
            error,
         }
      } finally {
         clearInterval(heartbeat)
      }
   }

   return async (message: Message) => {
      let item: T

      try {
         item = parse(message.content)
      } catch {
         // Never logged with its content: it may carry secrets. Not retried: it can never become valid.
         log.error('Rejected a message that is not valid')
         channel.nack(message, false, false)

         return
      }

      const result = await runJob(item)
      const { error } = result.ok ? { error: undefined } : result

      // The task did nothing wrong: it waits for the other task and keeps the retries it has left.
      if (error instanceof AccountBusyError) {
         logWaiting(label(item))
         await requeue(message, busyDelayMs, readRetries(message))

         return
      }

      waiting.delete(label(item))

      // The worker is leaving: the next one takes the message at once, as if this worker had never taken it.
      if (error instanceof ShutdownError) {
         log.info(`spider job handed back, the worker is stopping: ${label(item)}`)
         channel.nack(message, false, true)

         return
      }

      if (result.ok) {
         log.info(`spider job finished: ${label(item)}`)
         channel.ack(message)

         return
      }

      await retry(message, item, error instanceof Error ? error.message : 'unknown error')
   }
}

// Long-running mode: takes one message at a time and keeps taking them until stopped.
export const consumeQueue = async <T>(channel: ConsumerChannel, spec: QueueSpec<T>, options: ConsumerOptions) => {
   const handle = createHandler(channel, spec, options)
   let inFlight: Promise<void> = Promise.resolve()

   await channel.prefetch(1)

   const { consumerTag } = await channel.consume(
      spec.queue,
      message => {
         if (message) {
            inFlight = handle(message)
         }
      },
      { noAck: false }
   )

   return {
      stop: async () => {
         await channel.cancel(consumerTag)
         await inFlight
      },
   }
}

// Once mode: takes at most one message, handles it exactly as consumeQueue would, and returns. Nothing stays
// subscribed afterwards, so the process can leave.
export const consumeOnce = async <T>(channel: OnceChannel, spec: QueueSpec<T>, options: ConsumerOptions) => {
   const message = await channel.get(spec.queue, { noAck: false })

   if (!message) {
      return 'empty' as const
   }

   await createHandler(channel, spec, options)(message)

   return 'taken' as const
}

export const consumeTasks = (channel: ConsumerChannel, handler: TaskHandler, options: ConsumerOptions) =>
   consumeQueue(
      channel,
      {
         queue: TASK_QUEUE,
         parse: content => parseCommand(JSON.parse(content.toString())),
         label: command => `Task ${command.task_id}`,
         handler,
      },
      options
   )
