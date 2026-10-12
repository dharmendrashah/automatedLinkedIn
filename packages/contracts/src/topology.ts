// Shared with the scraping topology: both apps declare these, so either can start first.
export const EXCHANGE = 'scraping.exchange'
export const DEAD_EXCHANGE = 'scraping.dead'

export const VALIDATE_QUEUE = 'accounts.validate'
export const VALIDATE_DEAD_QUEUE = 'accounts.validate.dead'
export const VALIDATED_QUEUE = 'accounts.validated'
export const VALIDATE_KEY = 'account.validate'
export const VALIDATED_KEY = 'account.validated'

// The one task contract (.plan/spider-task-framework.md): every task goes through these queues.
export const TASK_QUEUE = 'tasks.run'
export const TASK_DEAD_QUEUE = 'tasks.run.dead'
export const TASK_DONE_QUEUE = 'tasks.done'
// Holds the latest catalog the worker announced; brain stores it, so a missed one only waits.
export const TASK_CATALOG_QUEUE = 'tasks.catalog'
export const TASK_KEY = 'task.run'
export const TASK_DONE_KEY = 'task.done'
export const TASK_CATALOG_KEY = 'task.catalog'

// A task that keeps failing is delivered this many times, then dead-lettered.
export const TASK_DELIVERY_LIMIT = 3

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

   await channel.assertQueue(TASK_DEAD_QUEUE, { durable: true })
   await channel.bindQueue(TASK_DEAD_QUEUE, DEAD_EXCHANGE, TASK_KEY)

   await channel.assertQueue(TASK_QUEUE, {
      durable: true,
      arguments: {
         'x-queue-type': 'quorum',
         'x-delivery-limit': TASK_DELIVERY_LIMIT,
         'x-dead-letter-exchange': DEAD_EXCHANGE,
      },
   })
   await channel.bindQueue(TASK_QUEUE, EXCHANGE, TASK_KEY)

   await channel.assertQueue(TASK_DONE_QUEUE, {
      durable: true,
      arguments: {
         'x-message-ttl': VALIDATED_TTL_MS,
         'x-max-length': VALIDATED_MAX_LENGTH,
      },
   })
   await channel.bindQueue(TASK_DONE_QUEUE, EXCHANGE, TASK_DONE_KEY)

   await channel.assertQueue(TASK_CATALOG_QUEUE, {
      durable: true,
      arguments: {
         'x-max-length': 1,
         'x-overflow': 'drop-head',
      },
   })
   await channel.bindQueue(TASK_CATALOG_QUEUE, EXCHANGE, TASK_CATALOG_KEY)
}
