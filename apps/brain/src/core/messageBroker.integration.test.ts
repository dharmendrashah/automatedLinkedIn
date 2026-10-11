import { type ConsumeMessage } from 'amqplib'
import { afterAll, describe, expect, it } from 'vitest'

import { MessageBroker } from './messageBroker'

describe('MessageBroker (RabbitMQ)', () => {
   afterAll(async () => {
      await MessageBroker.disconnect()
   })

   it('should report a reachable broker as healthy', async () => {
      await expect(MessageBroker.isHealthy()).resolves.toBe(true)
   })

   it('should deliver a message through the configured vhost', async () => {
      const connection = await MessageBroker.connection()
      const channel = await connection.createChannel()
      const { queue } = await channel.assertQueue('', {
         exclusive: true,
         autoDelete: true,
      })

      channel.sendToQueue(queue, Buffer.from('hello'))

      const message = await new Promise<ConsumeMessage | null>((resolve, reject) => {
         channel.consume(queue, resolve, { noAck: true }).catch(reject)
      })

      expect(message?.content.toString()).toBe('hello')

      await channel.close()
   })
})
