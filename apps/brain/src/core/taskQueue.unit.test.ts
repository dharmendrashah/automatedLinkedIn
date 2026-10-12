import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EXCHANGE, TASK_CATALOG_QUEUE, TASK_DONE_QUEUE, TASK_KEY } from '@automatedLinkedIn/contracts'

import { TaskQueue } from './taskQueue'

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

const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const command = {
   contract: 1 as const,
   task_id: TASK_ID,
   user_id: 'user-1',
   task: 'browser-detection',
   task_version: 1,
   requested_at: '2026-10-13T10:00:00.000Z',
   trigger: 'manual' as const,
   proxy: { server: 'http://proxy.example.com:8080' },
   input: {},
}

const result = {
   contract: 1 as const,
   task_id: TASK_ID,
   task: 'browser-detection',
   task_version: 1,
   status: 'SUCCEEDED' as const,
   verdict: 'NOT_DETECTED',
   message: 'Every detection page took this browser for a person.',
   artifacts: [],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: '2026-10-13T10:00:00.000Z',
   finished_at: '2026-10-13T10:01:00.000Z',
}

const catalog = {
   contract: 1 as const,
   announced_at: '2026-10-13T10:00:00.000Z',
   worker: { build: 'abc1234' },
   tasks: [],
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

describe('TaskQueue.publish', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should publish a persistent message on the task key and wait for the broker to confirm', async () => {
      const channel = fakeChannel()

      mocks.confirmChannel.mockResolvedValue(channel)

      await TaskQueue.publish(command)

      expect(channel.publish).toHaveBeenCalledWith(
         EXCHANGE,
         TASK_KEY,
         Buffer.from(JSON.stringify(command)),
         expect.objectContaining({
            persistent: true,
            contentType: 'application/json',
            messageId: TASK_ID,
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
         TaskQueue.publish({
            ...command,
            task: '../x',
         })
      ).rejects.toThrow()
      expect(channel.publish).not.toHaveBeenCalled()
   })

   it('should let a broker failure through, so the caller can end the session', async () => {
      const channel = fakeChannel()

      channel.waitForConfirms.mockRejectedValue(new Error('nack from broker'))
      mocks.confirmChannel.mockResolvedValue(channel)

      await expect(TaskQueue.publish(command)).rejects.toThrow('nack from broker')
   })
})

describe('TaskQueue consumers', () => {
   let deliver: (msg: unknown) => Promise<void>

   const start = async (kind: 'results' | 'catalog', handler = vi.fn().mockResolvedValue(undefined)) => {
      const channel = fakeChannel()
      const log = { error: vi.fn() }

      channel.consume.mockImplementation(async (_queue: string, callback: (msg: unknown) => Promise<void>) => {
         deliver = callback

         return { consumerTag: 'tag' }
      })
      mocks.channel.mockResolvedValue(channel)

      if (kind === 'results') {
         await TaskQueue.consumeResults(handler, log)
      } else {
         await TaskQueue.consumeCatalog(handler, log)
      }

      return {
         channel,
         handler,
      }
   }

   const message = (body: unknown) => ({
      content: Buffer.from(JSON.stringify(body)),
      fields: { redelivered: false },
   })

   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should take results from the results queue and acknowledge after the handler finished', async () => {
      const { channel, handler } = await start('results')
      const delivered = message(result)

      expect(channel.consume).toHaveBeenCalledWith(TASK_DONE_QUEUE, expect.any(Function), { noAck: false })

      await deliver(delivered)

      expect(handler).toHaveBeenCalledWith(result)
      expect(channel.ack).toHaveBeenCalledWith(delivered)
   })

   it('should drop a result that does not match the contract', async () => {
      const { channel, handler } = await start('results')
      const delivered = message({
         ...result,
         verdict: 'not a code',
      })

      await deliver(delivered)

      expect(handler).not.toHaveBeenCalled()
      expect(channel.nack).toHaveBeenCalledWith(delivered, false, false)
   })

   it('should take the catalog from its own queue', async () => {
      const { channel, handler } = await start('catalog')
      const delivered = message(catalog)

      expect(channel.consume).toHaveBeenCalledWith(TASK_CATALOG_QUEUE, expect.any(Function), { noAck: false })

      await deliver(delivered)

      expect(handler).toHaveBeenCalledWith(catalog)
      expect(channel.ack).toHaveBeenCalledWith(delivered)
   })
})
