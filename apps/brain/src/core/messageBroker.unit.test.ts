import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageBroker } from './messageBroker'

const mocks = vi.hoisted(() => ({ connect: vi.fn() }))

vi.mock('amqplib', () => ({ connect: mocks.connect }))

vi.mock('env', () => ({ RABBITMQ_URL: 'amqp://user:pass@localhost:5672/test' }))

// A stand-in for the amqplib connection: an emitter with a close() we can observe.
const fakeConnection = () => Object.assign(new EventEmitter(), { close: vi.fn().mockResolvedValue(undefined) })

describe('MessageBroker', () => {
   beforeEach(async () => {
      await MessageBroker.disconnect()
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should connect with the configured url and a connect timeout', async () => {
      mocks.connect.mockResolvedValue(fakeConnection())

      await expect(MessageBroker.isHealthy()).resolves.toBe(true)

      expect(mocks.connect).toHaveBeenCalledWith(
         'amqp://user:pass@localhost:5672/test',
         expect.objectContaining({ timeout: expect.any(Number) })
      )
   })

   it('should share one connection across calls', async () => {
      mocks.connect.mockResolvedValue(fakeConnection())

      await MessageBroker.isHealthy()
      await MessageBroker.isHealthy()

      expect(mocks.connect).toHaveBeenCalledTimes(1)
   })

   it('should report unhealthy when the broker cannot be reached, and try again next time', async () => {
      mocks.connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED')).mockResolvedValueOnce(fakeConnection())

      await expect(MessageBroker.isHealthy()).resolves.toBe(false)
      await expect(MessageBroker.isHealthy()).resolves.toBe(true)

      expect(mocks.connect).toHaveBeenCalledTimes(2)
   })

   it('should reconnect after the connection closes', async () => {
      const first = fakeConnection()
      mocks.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeConnection())

      await MessageBroker.isHealthy()
      first.emit('close')
      await MessageBroker.isHealthy()

      expect(mocks.connect).toHaveBeenCalledTimes(2)
   })

   it('should not crash the process on a connection error, and reconnect afterwards', async () => {
      const first = fakeConnection()
      mocks.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeConnection())

      await MessageBroker.isHealthy()

      expect(() => first.emit('error', new Error('socket hang up'))).not.toThrow()
      first.emit('close')
      await expect(MessageBroker.isHealthy()).resolves.toBe(true)
   })

   it('should log the error message without the connection url', async () => {
      const connection = fakeConnection()
      mocks.connect.mockResolvedValue(connection)

      await MessageBroker.isHealthy()
      connection.emit('error', new Error('socket hang up'))

      const logged = JSON.stringify(vi.mocked(console.error).mock.calls)

      expect(logged).toContain('socket hang up')
      expect(logged).not.toContain('pass')
   })

   it('should report unhealthy instead of hanging when the connect never answers', async () => {
      vi.useFakeTimers()
      mocks.connect.mockReturnValue(new Promise(() => undefined))

      const result = MessageBroker.isHealthy()

      await vi.advanceTimersByTimeAsync(10_000)

      await expect(result).resolves.toBe(false)
   })

   it('should close the open connection on disconnect and reconnect afterwards', async () => {
      const first = fakeConnection()
      mocks.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeConnection())

      await MessageBroker.isHealthy()
      await MessageBroker.disconnect()

      expect(first.close).toHaveBeenCalledTimes(1)

      await MessageBroker.isHealthy()

      expect(mocks.connect).toHaveBeenCalledTimes(2)
   })

   it('should treat disconnect as a no-op when nothing is connected or the connect failed', async () => {
      await expect(MessageBroker.disconnect()).resolves.toBeUndefined()

      mocks.connect.mockRejectedValueOnce(new Error('refused'))
      await MessageBroker.isHealthy()

      await expect(MessageBroker.disconnect()).resolves.toBeUndefined()
   })

   it('should not throw when closing a connection that is already gone', async () => {
      const connection = fakeConnection()
      connection.close.mockRejectedValue(new Error('Connection closed'))
      mocks.connect.mockResolvedValue(connection)

      await MessageBroker.isHealthy()

      await expect(MessageBroker.disconnect()).resolves.toBeUndefined()
   })
})
