import { type ConfirmChannel, type ConsumeMessage } from 'amqplib'

import {
   EXCHANGE,
   TAKEOVER_FRAME_KEY,
   TAKEOVER_INPUT_EXCHANGE,
   type TakeoverFrame,
   type TakeoverInput,
   takeoverInputSchema,
} from '@automatedLinkedIn/contracts'

// A picture is not worth keeping or confirming: the next one replaces it.
export const publishFrame = async (channel: Pick<ConfirmChannel, 'publish'>, frame: TakeoverFrame) => {
   channel.publish(EXCHANGE, TAKEOVER_FRAME_KEY, Buffer.from(JSON.stringify(frame)), {
      persistent: false,
      contentType: 'application/json',
   })
}

// Method syntax keeps it assignable from amqplib's channel, whose methods are overloaded.
type Listening = {
   assertQueue(queue: string, options: object): Promise<{ queue: string }>
   bindQueue(queue: string, exchange: string, key: string): Promise<unknown>
   consume(
      queue: string,
      onMessage: (message: ConsumeMessage | null) => void,
      options: { noAck: boolean }
   ): Promise<{ consumerTag: string }>
   cancel(consumerTag: string): Promise<unknown>
   deleteQueue(queue: string): Promise<unknown>
}

// The owner's inputs for one run. The queue belongs to this connection and goes with it, so a worker that crashes while
// waiting leaves nothing behind, and an input sent when nobody waits is dropped by the exchange. What does not match the
// contract is dropped: it came from outside.
export const listenForInput = async (channel: Listening, taskId: string, onInput: (input: TakeoverInput) => void) => {
   const { queue } = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
   })

   await channel.bindQueue(queue, TAKEOVER_INPUT_EXCHANGE, taskId)

   const { consumerTag } = await channel.consume(
      queue,
      (message: ConsumeMessage | null) => {
         if (!message) {
            return
         }

         try {
            onInput(takeoverInputSchema.parse(JSON.parse(message.content.toString())))
         } catch {
            // Never logged: it may hold what the owner typed.
         }
      },
      { noAck: true }
   )

   return {
      stop: async () => {
         await channel.cancel(consumerTag)
         await channel.deleteQueue(queue)
      },
   }
}
