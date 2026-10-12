// Shared with the scraping topology: both apps declare these, so either can start first.
export const EXCHANGE = 'scraping.exchange'
export const DEAD_EXCHANGE = 'scraping.dead'

export const VALIDATE_QUEUE = 'accounts.validate'
export const VALIDATE_DEAD_QUEUE = 'accounts.validate.dead'
export const VALIDATED_QUEUE = 'accounts.validated'
export const VALIDATE_KEY = 'account.validate'
export const VALIDATED_KEY = 'account.validated'

// Standard tasks (see .plan/spider-browser-test.md): jobs that need no LinkedIn account.
export const STANDARD_QUEUE = 'tasks.standard'
export const STANDARD_DEAD_QUEUE = 'tasks.standard.dead'
export const STANDARD_DONE_QUEUE = 'tasks.standard.done'
export const STANDARD_KEY = 'task.standard'
export const STANDARD_DONE_KEY = 'task.standard.done'

// A standard task that keeps failing is delivered this many times, then dead-lettered.
export const STANDARD_DELIVERY_LIMIT = 3

// A validation that keeps failing is delivered this many times, then dead-lettered.
export const VALIDATE_DELIVERY_LIMIT = 3

const VALIDATED_TTL_MS = 24 * 60 * 60 * 1000
const VALIDATED_MAX_LENGTH = 10_000

// The part of an amqplib channel the topology needs. Method syntax keeps it assignable from amqplib's overloads.
export type TopologyChannel = {
   assertExchange: (exchange: string, type: string, options?: object) => Promise<unknown>
   assertQueue: (queue: string, options?: object) => Promise<unknown>
   bindQueue: (queue: string, exchange: string, key: string) => Promise<unknown>
}

// Idempotent: the arguments must stay identical on both sides, or RabbitMQ refuses the second declaration.
export const assertAccountTopology = async (channel: TopologyChannel) => {
   await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
   await channel.assertExchange(DEAD_EXCHANGE, 'direct', { durable: true })

   await channel.assertQueue(VALIDATE_DEAD_QUEUE, { durable: true })
   await channel.bindQueue(VALIDATE_DEAD_QUEUE, DEAD_EXCHANGE, VALIDATE_KEY)

   await channel.assertQueue(VALIDATE_QUEUE, {
      durable: true,
      arguments: {
         'x-queue-type': 'quorum',
         'x-delivery-limit': VALIDATE_DELIVERY_LIMIT,
         'x-dead-letter-exchange': DEAD_EXCHANGE,
      },
   })
   await channel.bindQueue(VALIDATE_QUEUE, EXCHANGE, VALIDATE_KEY)

   await channel.assertQueue(VALIDATED_QUEUE, {
      durable: true,
      arguments: {
         'x-message-ttl': VALIDATED_TTL_MS,
         'x-max-length': VALIDATED_MAX_LENGTH,
      },
   })
   await channel.bindQueue(VALIDATED_QUEUE, EXCHANGE, VALIDATED_KEY)

   await channel.assertQueue(STANDARD_DEAD_QUEUE, { durable: true })
   await channel.bindQueue(STANDARD_DEAD_QUEUE, DEAD_EXCHANGE, STANDARD_KEY)

   await channel.assertQueue(STANDARD_QUEUE, {
      durable: true,
      arguments: {
         'x-queue-type': 'quorum',
         'x-delivery-limit': STANDARD_DELIVERY_LIMIT,
         'x-dead-letter-exchange': DEAD_EXCHANGE,
      },
   })
   await channel.bindQueue(STANDARD_QUEUE, EXCHANGE, STANDARD_KEY)

   await channel.assertQueue(STANDARD_DONE_QUEUE, {
      durable: true,
      arguments: {
         'x-message-ttl': VALIDATED_TTL_MS,
         'x-max-length': VALIDATED_MAX_LENGTH,
      },
   })
   await channel.bindQueue(STANDARD_DONE_QUEUE, EXCHANGE, STANDARD_DONE_KEY)
}
