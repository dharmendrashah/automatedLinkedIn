import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import {
   EXCHANGE,
   TAKEOVER_FRAME_KEY,
   TAKEOVER_INPUT_EXCHANGE,
   type TakeoverFrame,
   type TakeoverInput,
   assertTakeoverTopology,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'
import { TakeoverRelay } from './takeoverRelay'

// Needs a RabbitMQ at RABBITMQ_URL. The worker's side is played here: it publishes pictures to the exchange and listens for
// inputs on a queue of its own, as spider does.

afterAll(async () => {
   await MessageBroker.disconnect()
})

const frame = (taskId: string, seq: number): TakeoverFrame => ({
   contract: 1,
   task_id: taskId,
   seq,
   width: 1280,
   height: 720,
   jpeg: '/9j/4AAQ',
   expires_at: new Date(Date.now() + 600_000).toISOString(),
})

describe('TakeoverRelay (RabbitMQ)', () => {
   it('should hold the pictures a worker publishes, and hand the owner inputs to the worker waiting on the run', async () => {
      const taskId = randomUUID()
      const consumer = await TakeoverRelay.consume({ error: () => undefined })

      try {
         // The worker's side.
         const channel = await MessageBroker.channel()

         await assertTakeoverTopology(channel)

         const { queue } = await channel.assertQueue('', {
            exclusive: true,
            autoDelete: true,
         })

         await channel.bindQueue(queue, TAKEOVER_INPUT_EXCHANGE, taskId)

         const inputs: TakeoverInput[] = []

         await channel.consume(
            queue,
            message => {
               inputs.push(JSON.parse(String(message?.content)) as TakeoverInput)
            },
            { noAck: true }
         )

         channel.publish(EXCHANGE, TAKEOVER_FRAME_KEY, Buffer.from(JSON.stringify(frame(taskId, 1))))
         channel.publish(EXCHANGE, TAKEOVER_FRAME_KEY, Buffer.from(JSON.stringify(frame(taskId, 2))))

         await expect.poll(() => TakeoverRelay.latest(taskId)?.seq, { timeout: 10_000 }).toBe(2)
         expect(TakeoverRelay.heldIds()).toContain(taskId)

         await TakeoverRelay.send(taskId, {
            kind: 'type',
            text: '123456',
         })

         await expect
            .poll(() => inputs, { timeout: 10_000 })
            .toEqual([
               {
                  kind: 'type',
                  text: '123456',
               },
            ])

         await channel.close()
      } finally {
         await consumer.stop()
         TakeoverRelay.release(taskId)
      }
   })

   it('should drop an input when no worker waits on the run, instead of keeping it for a later one', async () => {
      await expect(
         TakeoverRelay.send(randomUUID(), {
            kind: 'type',
            text: 'x',
         })
      ).resolves.toBeUndefined()
   })
})
