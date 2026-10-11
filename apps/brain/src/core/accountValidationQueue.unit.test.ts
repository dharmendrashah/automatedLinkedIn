import { EventEmitter } from 'node:events'
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EXCHANGE, VALIDATED_QUEUE, VALIDATE_KEY, VALIDATE_QUEUE } from '@automatedLinkedIn/contracts'

import { AccountValidationQueue } from './accountValidationQueue'

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
   validation_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   account_id: 'acc1',
   email: 'ada@example.com',
   sealed: {
      ciphertext: 'Y2lwaGVy',
      iv: 'aXY=',
      tag: 'dGFn',
      key_version: 1,
   },
   requested_at: '2026-10-12T10:00:00.000Z',
}

const result = {
   validation_id: command.validation_id,
   account_id: 'acc1',
   outcome: 'VALID' as const,
   message: 'Signed in',
   checked_at: '2026-10-12T10:00:05.000Z',
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

const message = (body: unknown, redelivered = false) => ({
   content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
   fields: { redelivered },
})

describe('AccountValidationQueue.publish', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should declare the topology, then publish a persistent message and wait for the broker to confirm', async () => {
      const channel = fakeChannel()

      mocks.confirmChannel.mockResolvedValue(channel)

      await AccountValidationQueue.publish(command)

      expect(channel.assertQueue).toHaveBeenCalledWith(VALIDATE_QUEUE, expect.anything())
      expect(channel.publish).toHaveBeenCalledWith(
         EXCHANGE,
         VALIDATE_KEY,
         Buffer.from(JSON.stringify(command)),
         expect.objectContaining({
            persistent: true,
            contentType: 'application/json',
            messageId: command.validation_id,
         })
      )
      expect(channel.assertExchange.mock.invocationCallOrder[0]).toBeLessThan(
         channel.publish.mock.invocationCallOrder[0]
      )
      expect(channel.publish.mock.invocationCallOrder[0]).toBeLessThan(
         channel.waitForConfirms.mock.invocationCallOrder[0]
      )
   })

   it('should refuse to publish a command that does not match the contract', async () => {
      const channel = fakeChannel()

      mocks.confirmChannel.mockResolvedValue(channel)

      await expect(
         AccountValidationQueue.publish({
            ...command,
            account_id: '../x',
         })
      ).rejects.toThrow()
      expect(channel.publish).not.toHaveBeenCalled()
   })

   it('should let a broker failure through, so the caller can keep the account pending', async () => {
      const channel = fakeChannel()

      channel.waitForConfirms.mockRejectedValue(new Error('nack from broker'))
      mocks.confirmChannel.mockResolvedValue(channel)

      await expect(AccountValidationQueue.publish(command)).rejects.toThrow('nack from broker')
   })

   it('should let a connection failure through', async () => {
      mocks.confirmChannel.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(AccountValidationQueue.publish(command)).rejects.toThrow('ECONNREFUSED')
   })
})

describe('AccountValidationQueue.consume', () => {
   let log: { error: Mock<(message: string) => void> }
   let deliver: (msg: unknown) => Promise<void>

   const start = async (handler = vi.fn().mockResolvedValue(undefined), channel = fakeChannel()) => {
      channel.consume.mockImplementation(async (_queue: string, callback: (msg: unknown) => Promise<void>) => {
         deliver = callback

         return { consumerTag: 'tag' }
      })
      mocks.channel.mockResolvedValue(channel)

      const consumer = await AccountValidationQueue.consume(handler, log)

      return {
         channel,
         handler,
         consumer,
      }
   }

   beforeEach(() => {
      vi.resetAllMocks()
      log = { error: vi.fn<(message: string) => void>() }
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should declare the topology and take results with manual acknowledgement', async () => {
      const { channel } = await start()

      expect(channel.assertQueue).toHaveBeenCalledWith(VALIDATED_QUEUE, expect.anything())
      expect(channel.prefetch).toHaveBeenCalled()
      expect(channel.consume).toHaveBeenCalledWith(VALIDATED_QUEUE, expect.any(Function), { noAck: false })
   })

   it('should acknowledge a result only after the handler has finished', async () => {
      let finish: () => void = () => undefined
      const handler = vi.fn(() => new Promise<void>(resolve => (finish = resolve)))
      const { channel } = await start(handler)
      const msg = message(result)
      const delivered = deliver(msg)

      await Promise.resolve()

      expect(handler).toHaveBeenCalledWith(result)
      expect(channel.ack).not.toHaveBeenCalled()

      finish()
      await delivered

      expect(channel.ack).toHaveBeenCalledWith(msg)
   })

   it('should drop a message that is not a valid result, without logging its content', async () => {
      const { channel, handler } = await start()
      const bad = message({
         ...result,
         outcome: 'TOPSECRET',
      })
      const notJson = message('not json TOPSECRET')

      await deliver(bad)
      await deliver(notJson)

      expect(handler).not.toHaveBeenCalled()
      expect(channel.nack).toHaveBeenCalledWith(bad, false, false)
      expect(channel.nack).toHaveBeenCalledWith(notJson, false, false)
      expect(JSON.stringify(log.error.mock.calls)).not.toContain('TOPSECRET')
   })

   it('should try a failing result once more, then drop it, so a database outage cannot make it spin', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('database down'))
      const { channel } = await start(handler)
      const first = message(result)
      const second = message(result, true)

      await deliver(first)
      await deliver(second)

      expect(channel.nack).toHaveBeenNthCalledWith(1, first, false, true)
      expect(channel.nack).toHaveBeenNthCalledWith(2, second, false, false)
      expect(channel.ack).not.toHaveBeenCalled()
   })

   it('should ignore the null the broker sends when the consumer is cancelled', async () => {
      const { channel, handler } = await start()

      await deliver(null)

      expect(handler).not.toHaveBeenCalled()
      expect(channel.ack).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
   })

   it('should close its channel on stop and not reconnect afterwards', async () => {
      vi.useFakeTimers()

      const { channel, consumer } = await start()

      channel.close.mockImplementation(async () => {
         channel.emit('close')
      })
      await consumer.stop()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(channel.close).toHaveBeenCalledTimes(1)
      expect(mocks.channel).toHaveBeenCalledTimes(1)
   })

   it('should start again after the channel closes by itself', async () => {
      vi.useFakeTimers()

      const { channel } = await start()

      mocks.channel.mockResolvedValue(fakeChannel())
      channel.emit('close')
      await vi.advanceTimersByTimeAsync(10_000)

      expect(mocks.channel).toHaveBeenCalledTimes(2)
   })

   it('should not crash when the broker is down at start, and keep trying', async () => {
      vi.useFakeTimers()
      mocks.channel.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(fakeChannel())

      const consumer = await AccountValidationQueue.consume(vi.fn(), log)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(mocks.channel).toHaveBeenCalledTimes(2)
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))

      await consumer.stop()
   })

   it('should not crash the process on a channel error', async () => {
      const { channel } = await start()

      expect(() => channel.emit('error', new Error('channel closed'))).not.toThrow()
   })
})
