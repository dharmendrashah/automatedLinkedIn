import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountBusyError, ShutdownError } from '../scraping/errors'
import { MAX_RETRIES, consumeQueue, consumeTasks } from './consumer'
import { TASK_QUEUE } from './topology'

const command = {
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   task_type: 'demo',
   timestamp: '2026-10-11T10:00:00.000Z',
   auth_session_key: '',
   target_url: 'http://localhost:8080/',
   actions: [
      {
         step: 1,
         action: 'navigate',
         params: {},
      },
   ],
}

const message = (body: unknown, retries?: number) => ({
   content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
   properties: { headers: retries === undefined ? {} : { 'x-retries': retries } },
})

const setup = () => {
   let deliver: ((msg: unknown) => void) | undefined

   const channel = {
      prefetch: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn(async (_queue: string, callback: (msg: unknown) => void) => {
         deliver = callback

         return { consumerTag: 'tag-1' }
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
   }

   return {
      channel,
      send: (msg: unknown) => deliver?.(msg),
   }
}

describe('consumeTasks', () => {
   let log: { info: Mock<(message: string) => void>; error: Mock<(message: string) => void> }
   let republish: Mock<(message: unknown, retries: number) => Promise<void>>
   let sleep: Mock<(ms: number) => Promise<void>>
   let options: {
      log: typeof log
      republish: typeof republish
      sleep: typeof sleep
      backoffMs: number[]
      busyDelayMs: number
   }

   beforeEach(() => {
      log = {
         info: vi.fn<(message: string) => void>(),
         error: vi.fn<(message: string) => void>(),
      }
      republish = vi.fn<(message: unknown, retries: number) => Promise<void>>().mockResolvedValue(undefined)
      sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
      options = {
         log,
         republish,
         sleep,
         backoffMs: [10, 20, 30],
         busyDelayMs: 7,
      }
   })

   it('should take one message at a time and require manual acknowledgement', async () => {
      const { channel } = setup()

      await consumeTasks(channel as never, vi.fn(), options)

      expect(channel.prefetch).toHaveBeenCalledWith(1)
      expect(channel.consume).toHaveBeenCalledWith(TASK_QUEUE, expect.any(Function), { noAck: false })
      expect(channel.prefetch.mock.invocationCallOrder[0]).toBeLessThan(channel.consume.mock.invocationCallOrder[0])
   })

   it('should acknowledge only after the handler has finished (late ack)', async () => {
      const { channel, send } = setup()
      let finish: () => void = () => undefined
      const handler = vi.fn(() => new Promise<void>(resolve => (finish = resolve)))
      const msg = message(command)

      const consumer = await consumeTasks(channel as never, handler, options)

      send(msg)
      await Promise.resolve()

      expect(handler).toHaveBeenCalledWith(command)
      expect(channel.ack).not.toHaveBeenCalled()

      finish()
      await consumer.stop()

      expect(channel.ack).toHaveBeenCalledWith(msg)
      expect(channel.nack).not.toHaveBeenCalled()
   })

   it('should retry a failed task by publishing it again with a counter, then acknowledge the old copy', async () => {
      const { channel, send } = setup()
      const msg = message(command)
      const consumer = await consumeTasks(channel as never, vi.fn().mockRejectedValue(new Error('gcs down')), options)

      send(msg)
      await consumer.stop()

      expect(republish).toHaveBeenCalledWith(msg, 1)
      expect(channel.ack).toHaveBeenCalledWith(msg)
      expect(channel.nack).not.toHaveBeenCalled()
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('gcs down'))
   })

   it('should wait longer before each retry, so a broken dependency is not hammered', async () => {
      const { channel, send } = setup()
      const consumer = await consumeTasks(channel as never, vi.fn().mockRejectedValue(new Error('down')), options)

      send(message(command))
      send(message(command, 1))
      send(message(command, 2))
      await consumer.stop()

      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20, 30])
      expect(republish.mock.calls.map(([, retries]) => retries)).toEqual([1, 2, 3])
   })

   it('should dead-letter a task once it has used all its retries', async () => {
      const { channel, send } = setup()
      const msg = message(command, MAX_RETRIES)
      const consumer = await consumeTasks(channel as never, vi.fn().mockRejectedValue(new Error('down')), options)

      send(msg)
      await consumer.stop()

      expect(republish).not.toHaveBeenCalled()
      expect(channel.nack).toHaveBeenCalledWith(msg, false, false)
      expect(channel.ack).not.toHaveBeenCalled()
   })

   it('should put the task back in the queue if it cannot be published again', async () => {
      const { channel, send } = setup()
      const msg = message(command)

      republish.mockRejectedValue(new Error('broker down'))

      const consumer = await consumeTasks(channel as never, vi.fn().mockRejectedValue(new Error('down')), options)

      send(msg)
      await consumer.stop()

      expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
      expect(channel.ack).not.toHaveBeenCalled()
   })

   describe('when another task holds the account', () => {
      it('should wait, publish the task again with the same retry counter, and acknowledge the old copy', async () => {
         const { channel, send } = setup()
         const first = message(command)
         const third = message(command, 2)
         const consumer = await consumeTasks(
            channel as never,
            vi.fn().mockRejectedValue(new AccountBusyError()),
            options
         )

         send(first)
         send(third)
         await consumer.stop()

         expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([7, 7])
         expect(republish.mock.calls.map(([, retries]) => retries)).toEqual([0, 2])
         expect(channel.ack).toHaveBeenCalledWith(first)
         expect(channel.ack).toHaveBeenCalledWith(third)
         expect(channel.nack).not.toHaveBeenCalled()
      })

      it('should never dead-letter a task because the account stayed busy', async () => {
         const { channel, send } = setup()
         const msg = message(command, MAX_RETRIES)
         const consumer = await consumeTasks(
            channel as never,
            vi.fn().mockRejectedValue(new AccountBusyError()),
            options
         )

         send(msg)
         await consumer.stop()

         expect(republish).toHaveBeenCalledWith(msg, MAX_RETRIES)
         expect(channel.nack).not.toHaveBeenCalled()
      })

      it('should put the task back in the queue if it cannot be published again', async () => {
         const { channel, send } = setup()
         const msg = message(command)

         republish.mockRejectedValue(new Error('broker down'))

         const consumer = await consumeTasks(
            channel as never,
            vi.fn().mockRejectedValue(new AccountBusyError()),
            options
         )

         send(msg)
         await consumer.stop()

         expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
      })
   })

   describe('when the worker is stopping', () => {
      it('should put the message straight back in the queue, without a retry, a wait or a new copy', async () => {
         const { channel, send } = setup()
         const msg = message(command, 2)
         const consumer = await consumeTasks(channel as never, vi.fn().mockRejectedValue(new ShutdownError()), options)

         send(msg)
         await consumer.stop()

         expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
         expect(channel.ack).not.toHaveBeenCalled()
         expect(republish).not.toHaveBeenCalled()
         expect(sleep).not.toHaveBeenCalled()
         expect(log.error).not.toHaveBeenCalled()
      })
   })

   it('should not run the handler again for a message it already ran without error', async () => {
      const { channel, send } = setup()
      const handler = vi.fn().mockResolvedValue(undefined)
      const consumer = await consumeTasks(channel as never, handler, options)

      send(message(command))
      await consumer.stop()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(republish).not.toHaveBeenCalled()
      expect(sleep).not.toHaveBeenCalled()
   })

   it('should send an invalid message to the dead-letter queue instead of retrying it', async () => {
      const { channel, send } = setup()
      const handler = vi.fn()
      const consumer = await consumeTasks(channel as never, handler, options)
      const bad = message({ task_id: 'nope' })
      const notJson = message('this is not json')

      send(bad)
      send(notJson)
      await consumer.stop()

      expect(handler).not.toHaveBeenCalled()
      expect(channel.nack).toHaveBeenCalledWith(bad, false, false)
      expect(channel.nack).toHaveBeenCalledWith(notJson, false, false)
   })

   describe('job log lines', () => {
      it('should log when a job starts and when it finishes', async () => {
         const { channel, send } = setup()
         const handler = vi.fn().mockResolvedValue(undefined)
         const consumer = await consumeTasks(channel as never, handler, options)

         send(message(command))
         await consumer.stop()

         const lines = log.info.mock.calls.map(call => call[0])
         expect(lines).toEqual([
            `spider job started: Task ${command.task_id}`,
            `spider job finished: Task ${command.task_id}`,
         ])
      })

      it('should log a heartbeat while a long job is still running', async () => {
         const { channel, send } = setup()
         const handler = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 60)))
         const consumer = await consumeTasks(channel as never, handler, {
            ...options,
            heartbeatMs: 5,
         })

         send(message(command))
         await consumer.stop()

         const heartbeats = log.info.mock.calls.filter(call => call[0].startsWith('spider job still running'))
         expect(heartbeats.length).toBeGreaterThan(0)
      })

      it('should stop the heartbeat once the job has finished', async () => {
         const { channel, send } = setup()
         const handler = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 20)))
         const consumer = await consumeTasks(channel as never, handler, {
            ...options,
            heartbeatMs: 5,
         })

         send(message(command))
         await consumer.stop()
         const countAtFinish = log.info.mock.calls.length
         await new Promise(resolve => setTimeout(resolve, 30))

         expect(log.info.mock.calls.length).toBe(countAtFinish)
      })

      it('should log a job waiting for its account once a minute instead of starting it again', async () => {
         const { channel, send } = setup()
         let clock = 0
         const handler = vi
            .fn()
            .mockRejectedValueOnce(new AccountBusyError())
            .mockRejectedValueOnce(new AccountBusyError())
            .mockRejectedValueOnce(new AccountBusyError())
            .mockResolvedValueOnce(undefined)
         sleep.mockImplementation(async ms => {
            clock += ms
         })
         const consumer = await consumeTasks(channel as never, handler, {
            ...options,
            busyDelayMs: 40_000,
            now: () => clock,
         })

         for (let attempt = 0; attempt < 4; attempt++) {
            send(message(command))
            await new Promise(resolve => setTimeout(resolve, 0))
         }
         await consumer.stop()

         const waiting = `spider job waiting: Task ${command.task_id} (its account is in use)`
         expect(log.info.mock.calls.map(call => call[0])).toEqual([
            `spider job started: Task ${command.task_id}`,
            waiting,
            waiting,
            `spider job finished: Task ${command.task_id}`,
         ])
      })

      it('should not log a finish for a job that failed and is retried', async () => {
         const { channel, send } = setup()
         const handler = vi.fn().mockRejectedValue(new Error('boom'))
         const consumer = await consumeTasks(channel as never, handler, options)

         send(message(command))
         await consumer.stop()

         expect(log.info.mock.calls.map(call => call[0])).not.toContain(`spider job finished: Task ${command.task_id}`)
      })
   })

   it('should not log the content of a rejected message', async () => {
      const { channel, send } = setup()
      const consumer = await consumeTasks(channel as never, vi.fn(), options)

      send(message({ auth_session_key: 'sessions/TOPSECRET.json' }))
      await consumer.stop()

      expect(JSON.stringify(log.error.mock.calls)).not.toContain('TOPSECRET')
   })

   it('should ignore the null the broker sends when the consumer is cancelled', async () => {
      const { channel, send } = setup()

      await consumeTasks(channel as never, vi.fn(), options)

      expect(() => send(null)).not.toThrow()
      expect(channel.ack).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
   })

   it('should stop taking new messages and wait for the one in progress', async () => {
      const { channel, send } = setup()
      let finish: () => void = () => undefined
      const handler = vi.fn(() => new Promise<void>(resolve => (finish = resolve)))
      const consumer = await consumeTasks(channel as never, handler, options)

      send(message(command))

      let stopped = false
      const stopping = consumer.stop().then(() => {
         stopped = true
      })

      await Promise.resolve()
      await Promise.resolve()

      expect(channel.cancel).toHaveBeenCalledWith('tag-1')
      expect(stopped).toBe(false)

      finish()
      await stopping

      expect(stopped).toBe(true)
   })

   describe('consumeQueue', () => {
      type Item = { id: string }

      const parse = (content: Buffer): Item => {
         const parsed = JSON.parse(content.toString()) as Partial<Item>

         if (typeof parsed.id !== 'string') {
            throw new Error('not an item')
         }

         return { id: parsed.id }
      }

      const spec = (over: Partial<Parameters<typeof consumeQueue<Item>>[1]> = {}) => ({
         queue: 'other.queue',
         parse,
         label: ({ id }: Item) => `Item ${id}`,
         handler: vi.fn().mockResolvedValue(undefined),
         ...over,
      })

      it('should take messages from the queue it is given and hand over what its parser made of them', async () => {
         const { channel, send } = setup()
         const queueSpec = spec()
         const consumer = await consumeQueue(channel as never, queueSpec, options)
         const msg = message({ id: 'one' })

         send(msg)
         await consumer.stop()

         expect(channel.consume).toHaveBeenCalledWith('other.queue', expect.any(Function), { noAck: false })
         expect(queueSpec.handler).toHaveBeenCalledWith({ id: 'one' })
         expect(channel.ack).toHaveBeenCalledWith(msg)
      })

      it('should send a message its parser refuses to the dead-letter queue, without logging it', async () => {
         const { channel, send } = setup()
         const consumer = await consumeQueue(channel as never, spec(), options)
         const bad = message({
            id: 5,
            secret: 'TOPSECRET',
         })

         send(bad)
         await consumer.stop()

         expect(channel.nack).toHaveBeenCalledWith(bad, false, false)
         expect(JSON.stringify(log.error.mock.calls)).not.toContain('TOPSECRET')
      })

      it('should call onExhausted instead of dead-lettering once the retries are used up, then acknowledge', async () => {
         const { channel, send } = setup()
         const onExhausted = vi.fn().mockResolvedValue(undefined)
         const consumer = await consumeQueue(
            channel as never,
            spec({
               handler: vi.fn().mockRejectedValue(new Error('browser crashed')),
               onExhausted,
            }),
            options
         )
         const msg = message({ id: 'one' }, MAX_RETRIES)

         send(msg)
         await consumer.stop()

         expect(onExhausted).toHaveBeenCalledWith({ id: 'one' }, 'browser crashed')
         expect(channel.ack).toHaveBeenCalledWith(msg)
         expect(channel.nack).not.toHaveBeenCalled()
         expect(republish).not.toHaveBeenCalled()
      })

      it('should keep retrying as usual before the retries are used up, even with onExhausted', async () => {
         const { channel, send } = setup()
         const onExhausted = vi.fn()
         const consumer = await consumeQueue(
            channel as never,
            spec({
               handler: vi.fn().mockRejectedValue(new Error('down')),
               onExhausted,
            }),
            options
         )

         send(message({ id: 'one' }, 1))
         await consumer.stop()

         expect(onExhausted).not.toHaveBeenCalled()
         expect(republish).toHaveBeenCalledWith(expect.anything(), 2)
      })

      it('should put the message back in the queue when onExhausted itself fails', async () => {
         const { channel, send } = setup()
         const consumer = await consumeQueue(
            channel as never,
            spec({
               handler: vi.fn().mockRejectedValue(new Error('down')),
               onExhausted: vi.fn().mockRejectedValue(new Error('broker down')),
            }),
            options
         )
         const msg = message({ id: 'one' }, MAX_RETRIES)

         send(msg)
         await consumer.stop()

         expect(channel.nack).toHaveBeenCalledWith(msg, false, true)
         expect(channel.ack).not.toHaveBeenCalled()
      })

      it('should wait and publish again, with the same counter, while the account is busy', async () => {
         const { channel, send } = setup()
         const consumer = await consumeQueue(
            channel as never,
            spec({ handler: vi.fn().mockRejectedValue(new AccountBusyError()) }),
            options
         )
         const msg = message({ id: 'one' }, 2)

         send(msg)
         await consumer.stop()

         expect(sleep).toHaveBeenCalledWith(7)
         expect(republish).toHaveBeenCalledWith(msg, 2)
         expect(channel.ack).toHaveBeenCalledWith(msg)
      })
   })
})
