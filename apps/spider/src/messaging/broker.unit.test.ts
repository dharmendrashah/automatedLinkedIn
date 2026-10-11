import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Broker } from './broker'

const channel = () => Object.assign(new EventEmitter(), { close: vi.fn().mockResolvedValue(undefined) })

const connection = () =>
   Object.assign(new EventEmitter(), {
      close: vi.fn().mockResolvedValue(undefined),
      createChannel: vi.fn(async () => channel()),
      createConfirmChannel: vi.fn(async () => channel()),
   })

const brokerWith = (connect: ReturnType<typeof vi.fn>) => new Broker('amqp://u:p@h/v', connect as never)

describe('Broker', () => {
   afterEach(() => {
      vi.useRealTimers()
   })

   it('should connect with the url and a connect timeout, once, and share the connection', async () => {
      const conn = connection()
      const connect = vi.fn().mockResolvedValue(conn)
      const broker = brokerWith(connect)

      await broker.connection()
      await broker.connection()

      expect(connect).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledWith('amqp://u:p@h/v', expect.objectContaining({ timeout: expect.any(Number) }))
   })

   it('should try again after a failed connect', async () => {
      const connect = vi.fn().mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce(connection())
      const broker = brokerWith(connect)

      await expect(broker.connection()).rejects.toThrow('refused')
      await expect(broker.connection()).resolves.toBeDefined()
   })

   it('should reconnect after the connection closes, and survive an error event', async () => {
      const first = connection()
      const connect = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(connection())
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const broker = brokerWith(connect)

      await broker.connection()

      expect(() => first.emit('error', new Error('socket hang up'))).not.toThrow()

      first.emit('close')
      await broker.connection()

      expect(connect).toHaveBeenCalledTimes(2)
      expect(error).toHaveBeenCalled()
      error.mockRestore()
   })

   it('should reuse one confirm channel for publishing and open a fresh channel for consuming', async () => {
      const conn = connection()
      const broker = brokerWith(vi.fn().mockResolvedValue(conn))

      await broker.publishChannel()
      await broker.publishChannel()
      await broker.consumeChannel()
      await broker.consumeChannel()

      expect(conn.createConfirmChannel).toHaveBeenCalledTimes(1)
      expect(conn.createChannel).toHaveBeenCalledTimes(2)
   })

   it('should open a new confirm channel after the old one closes', async () => {
      const conn = connection()
      const first = channel()
      conn.createConfirmChannel.mockResolvedValueOnce(first as never)
      const broker = brokerWith(vi.fn().mockResolvedValue(conn))

      await broker.publishChannel()
      first.emit('close')
      await broker.publishChannel()

      expect(conn.createConfirmChannel).toHaveBeenCalledTimes(2)
   })

   it('should report health without throwing, and not hang on a connect that never answers', async () => {
      const ok = brokerWith(vi.fn().mockResolvedValue(connection()))

      await expect(ok.isHealthy()).resolves.toBe(true)

      vi.useFakeTimers()

      const stuck = brokerWith(vi.fn().mockReturnValue(new Promise(() => undefined)))
      const result = stuck.isHealthy()

      await vi.advanceTimersByTimeAsync(10_000)

      await expect(result).resolves.toBe(false)
      await expect(brokerWith(vi.fn().mockRejectedValue(new Error('refused'))).isHealthy()).resolves.toBe(false)
   })

   it('should close the connection and tolerate it already being gone', async () => {
      const conn = connection()
      const broker = brokerWith(vi.fn().mockResolvedValue(conn))

      await broker.connection()
      await broker.close()

      expect(conn.close).toHaveBeenCalledTimes(1)

      conn.close.mockRejectedValue(new Error('Connection closed'))
      await broker.connection()

      await expect(broker.close()).resolves.toBeUndefined()
      await expect(brokerWith(vi.fn()).close()).resolves.toBeUndefined()
   })
})
