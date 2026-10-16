import { type Channel } from 'amqplib'

export type RetryPolicy = {
   // How many times a failed message is tried again before it goes to the dead queue.
   max: number
   // The wait before each retry; the last value is reused when there are more retries than values.
   backoffMs: number[]
}

export const DEFAULT_PREFETCH = 10

export const DEFAULT_RETRY: RetryPolicy = {
   max: 3,
   backoffMs: [5_000, 30_000, 120_000],
}

// What a queue needs from the worker. The runner does everything else, the same way for every queue.
export type ConsumerDefinition<T = unknown> = {
   // Permanent: logs, health and the replay command use it.
   name: string
   queue: string
   // Declares what the queue needs; it must stay identical on every side or RabbitMQ refuses it.
   topology: (channel: Channel) => Promise<unknown>
   // Throws when the body is not valid; the message then goes to the dead queue.
   parse: (content: string) => T
   // Names an item in the log. Never includes a secret.
   label: (item: T) => string
   // Must be idempotent: a message can be delivered more than once.
   handle: (item: T) => Promise<void>
   prefetch?: number
   retry?: RetryPolicy
}

// Keeps the item type for the author and erases it for the registry.
export const defineConsumer = <T>(definition: ConsumerDefinition<T>) => definition as unknown as ConsumerDefinition
