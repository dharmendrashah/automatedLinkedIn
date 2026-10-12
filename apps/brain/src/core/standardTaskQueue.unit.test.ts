import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EXCHANGE, STANDARD_DONE_QUEUE, STANDARD_KEY } from '@automatedLinkedIn/contracts'

import { StandardTaskQueue } from './standardTaskQueue'

const mocks = vi.hoisted(() => ({
   confirmChannel: vi.fn(),
   channel: vi.fn(),
}))

vi.mock('./messageBroker', () => ({
   MessageBroker: {
      confirmChannel: mocks.confirmChannel,
      channel: mocks.channel,
   },
}))

const command = {
   task: 'browser_detection' as const,
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   proxy: { server: 'http://proxy.example.com:8080' },
   requested_at: '2026-10-12T10:00:00.000Z',
}

const result = {
   task: 'browser_detection' as const,
   task_id: command.task_id,
   outcome: 'NOT_DETECTED' as const,
   message: 'Every detection page took this browser for a person.',
   finished_at: '2026-10-12T10:01:00.000Z',
}

const fakeChannel = () =>
   Object.assign(new EventEmitter(), {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      prefetch: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue({ consumerTag: 'tag' }),
      publish: vi.fn().mockReturnValue(true),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
   })

describe('StandardTaskQueue.publish', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should publish a persistent message on the standard key and wait for the broker to confirm', async () => {
      const channel = fakeChannel()

      mocks.confirmChannel.mockResolvedValue(channel)

      await StandardTaskQueue.publish(command)

      expect(channel.publish).toHaveBeenCalledWith(
         EXCHANGE,
         STANDARD_KEY,
         Buffer.from(JSON.stringify(command)),
         expect.objectContaining({
            persistent: true,
            contentType: 'application/json',
            messageId: command.task_id,
         })
      )
      expect(channel.publish.mock.invocationCallOrder[0]).toBeLessThan(
         channel.waitForConfirms.mock.invocationCallOrder[0]
      )
   })

   it('should refuse a command that does not match the contract', async () => {
      const channel = fakeChannel()

      mocks.confirmChannel.mockResolvedValue(channel)

      await expect(
         StandardTaskQueue.publish({
            ...command,
            task_id: 'nope',
         })
      ).rejects.toThrow()
      expect(channel.publish).not.toHaveBeenCalled()
   })

   it('should let a broker failure through, so the caller can end the session', async () => {
      const channel = fakeChannel()

      channel.waitForConfirms.mockRejectedValue(new Error('nack from broker'))
      mocks.confirmChannel.mockResolvedValue(channel)

      await expect(StandardTaskQueue.publish(command)).rejects.toThrow('nack from broker')
   })
})

describe('StandardTaskQueue.consume', () => {
   let deliver: (msg: unknown) => Promise<void>

   const start = async (handler = vi.fn().mockResolvedValue(undefined)) => {
      const channel = fakeChannel()
      const log = { error: vi.fn() }

      channel.consume.mockImplementation(async (_queue: string, callback: (msg: unknown) => Promise<void>) => {
         deliver = callback

         return { consumerTag: 'tag' }
      })
      mocks.channel.mockResolvedValue(channel)
      await StandardTaskQueue.consume(handler, log)

      return {
         channel,
         handler,
         log,
      }
   }

   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should take results from the standard results queue and acknowledge after the handler finished', async () => {
      const { channel, handler } = await start()
      const message = {
         content: Buffer.from(JSON.stringify(result)),
         fields: { redelivered: false },
      }

      expect(channel.consume).toHaveBeenCalledWith(STANDARD_DONE_QUEUE, expect.any(Function), { noAck: false })

      await deliver(message)

      expect(handler).toHaveBeenCalledWith(result)
      expect(channel.ack).toHaveBeenCalledWith(message)
   })

   it('should drop a result that does not match the contract', async () => {
      const { channel, handler } = await start()
      const message = {
         content: Buffer.from(
            JSON.stringify({
               ...result,
               outcome: 'VALID',
            })
         ),
         fields: { redelivered: false },
      }

      await deliver(message)

      expect(handler).not.toHaveBeenCalled()
      expect(channel.nack).toHaveBeenCalledWith(message, false, false)
   })
})
