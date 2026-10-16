import { type Channel } from 'amqplib'

// A message that could not be applied is kept here, so nothing is lost and the replay command can try it again. A new
// queue per consumer: an existing queue cannot be redeclared with other arguments.
const DEAD_QUEUE_MAX_LENGTH = 10_000

export const deadQueueName = (queue: string) => `${queue}.dead`

export const DEAD_QUEUE_OPTIONS = {
   durable: true,
   arguments: { 'x-max-length': DEAD_QUEUE_MAX_LENGTH },
}

// How many messages wait in the dead queue of each queue. Opens a channel of its own, because asking after a queue that
// does not exist closes the channel.
export const deadDepths = async (queues: string[], openChannel: () => Promise<Channel>) => {
   const channel = await openChannel()

   try {
      const depths: Array<{ queue: string; messages: number }> = []

      for (const queue of queues) {
         const dead = deadQueueName(queue)
         const { messageCount } = await channel.checkQueue(dead)

         depths.push({
            queue: dead,
            messages: messageCount,
         })
      }

      return depths
   } finally {
      await channel.close().catch(() => undefined)
   }
}
