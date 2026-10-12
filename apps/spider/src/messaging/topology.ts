import { type Channel } from 'amqplib'

import { DEAD_EXCHANGE, EXCHANGE, assertAccountTopology } from '@automatedLinkedIn/contracts'

// The exchanges are shared with brain's validation queues, so both apps declare them from the same constants.
export { DEAD_EXCHANGE, EXCHANGE }
export const TASK_QUEUE = 'linkedin.requests'
export const DEAD_QUEUE = 'linkedin.requests.dead'
export const RESULT_QUEUE = 'scraping.results'
export const TASK_KEY = 'linkedin.task'
export const RESULT_KEY = 'task.result'

// A task that keeps failing is delivered this many times, then moved to the dead-letter queue.
export const DELIVERY_LIMIT = 3

const RESULT_TTL_MS = 24 * 60 * 60 * 1000
const RESULT_MAX_LENGTH = 10_000

// Everything is durable. Tasks use a quorum queue because it counts redeliveries, so a poison message
// cannot loop forever; results are kept for a day and capped, since nothing consumes them yet.
export const assertTopology = async (channel: Pick<Channel, 'assertExchange' | 'assertQueue' | 'bindQueue'>) => {
   await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
   await channel.assertExchange(DEAD_EXCHANGE, 'direct', { durable: true })

   await channel.assertQueue(DEAD_QUEUE, { durable: true })
   await channel.bindQueue(DEAD_QUEUE, DEAD_EXCHANGE, TASK_KEY)

   await channel.assertQueue(TASK_QUEUE, {
      durable: true,
      arguments: {
         'x-queue-type': 'quorum',
         'x-delivery-limit': DELIVERY_LIMIT,
         'x-dead-letter-exchange': DEAD_EXCHANGE,
      },
   })
   await channel.bindQueue(TASK_QUEUE, EXCHANGE, TASK_KEY)

   await channel.assertQueue(RESULT_QUEUE, {
      durable: true,
      arguments: {
         'x-message-ttl': RESULT_TTL_MS,
         'x-max-length': RESULT_MAX_LENGTH,
      },
   })
   await channel.bindQueue(RESULT_QUEUE, EXCHANGE, RESULT_KEY)

   // Brain asks for account validations and reads the answers on these.
   await assertAccountTopology(channel)
}
