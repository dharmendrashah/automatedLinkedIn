import { type ConfirmChannel } from 'amqplib'

import { FAILURE_HEADER, RETRIES_HEADER } from './consumerRunner'
import { DEAD_QUEUE_OPTIONS, deadQueueName } from './deadQueue'
import { type ConsumerDefinition } from './defineConsumer'

// Moves what is in the dead queue of a consumer back to its queue, with the retry count and the failure reason cleared, so
// it gets the full set of retries again. Meant for after the cause is fixed. Resolves to how many messages moved.
export const replayDead = async (channel: ConfirmChannel, { queue, topology }: ConsumerDefinition) => {
   const dead = deadQueueName(queue)

   await topology(channel)
   await channel.assertQueue(dead, DEAD_QUEUE_OPTIONS)

   const { messageCount } = await channel.checkQueue(dead)
   let moved = 0

   for (let index = 0; index < messageCount; index += 1) {
      const message = await channel.get(dead, { noAck: false })

      if (!message) {
         break
      }

      const { [RETRIES_HEADER]: _retries, [FAILURE_HEADER]: _failure, ...headers } = message.properties.headers ?? {}

      try {
         channel.sendToQueue(queue, message.content, {
            persistent: true,
            contentType: message.properties.contentType,
            messageId: message.properties.messageId,
            headers,
         })
         await channel.waitForConfirms()
         channel.ack(message)
      } catch (error) {
         channel.nack(message, false, true)

         throw error
      }

      moved += 1
   }

   return moved
}
