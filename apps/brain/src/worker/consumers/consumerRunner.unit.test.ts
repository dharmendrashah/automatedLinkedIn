import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsumerRunner, FAILURE_HEADER, RETRIES_HEADER } from './consumerRunner'
import { type ConsumerDefinition } from './defineConsumer'

const fakeChannel = () =>
   Object.assign(new EventEmitter(), {
      assertQueue: vi.fn().mockResolvedValue(undefined),
      prefetch: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue({ consumerTag: 'tag' }),
      cancel: vi.fn().mockResolvedValue(undefined),
      sendToQueue: vi.fn().mockReturnValue(true),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
   })

type FakeChannel = ReturnType<typeof fakeChannel>

const message = (body: unknown, headers: Record<string, unknown> = {}) => ({
   content: Buffer.from(JSON.stringify(body)),
   fields: { redelivered: false },
   properties: {
      contentType: 'application/json',
      messageId: 'm1',
      headers,
   },
})

type Item = { id: string }

const setup = async (overrides: Partial<ConsumerDefinition<Item>> = {}, brokerDownAtFirst = false) => {
   const channel = fakeChannel()
   const log = {
      info: vi.fn(),
      error: vi.fn(),
   }
   let deliver: (delivered: unknown) => void = () => undefined

   channel.consume.mockImplementation(async (_queue: string, callback: (delivered: unknown) => void) => {
      deliver = callback

      return { consumerTag: 'tag' }
   })

   const definition: ConsumerDefinition<Item> = {
      name: 'results',
      queue: 'tasks.done',
      topology: vi.fn().mockResolvedValue(undefined),
      parse: content => {
         const parsed = JSON.parse(content) as Item

         if (typeof parsed.id !== 'string') {
            throw new Error('bad')
         }

         return parsed
      },
      label: item => `item ${item.id}`,
      handle: vi.fn().mockResolvedValue(undefined),
      retry: {
         max: 2,
         backoffMs: [1000, 5000],
      },
      ...overrides,
   }
   const openChannel = vi.fn().mockResolvedValue(channel)

   if (brokerDownAtFirst) {
      openChannel.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
   }

   const runner = new ConsumerRunner(definition as unknown as ConsumerDefinition, {
      openChannel,
      log,
      reconnectMs: 100,
   })

   await runner.start()

   return {
      runner,
      channel,
      log,
      definition,
      openChannel,
      deliver: (delivered: ReturnType<typeof message>) => deliver(delivered),
   }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

const retriesOf = (channel: FakeChannel) =>
   (channel.sendToQueue.mock.calls[0][2] as { headers: Record<string, unknown> }).headers

describe('ConsumerRunner', () => {
   beforeEach(() => {
      vi.useFakeTimers()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should declare the topology and the dead queue, then consume with the prefetch', async () => {
      const { channel, definition, runner } = await setup({ prefetch: 4 })

      expect(definition.topology).toHaveBeenCalledWith(channel)
      expect(channel.assertQueue).toHaveBeenCalledWith('tasks.done.dead', expect.objectContaining({ durable: true }))
      expect(channel.prefetch).toHaveBeenCalledWith(4)
      expect(channel.consume).toHaveBeenCalledWith('tasks.done', expect.any(Function), { noAck: false })
      expect(runner.state().connected).toBe(true)
   })

   it('should acknowledge only after the handler finished, and count it', async () => {
      const { channel, definition, deliver, runner, log } = await setup()
      const delivered = message({ id: 'a' })

      deliver(delivered)
      await settle()

      expect(definition.handle).toHaveBeenCalledWith({ id: 'a' })
      expect(channel.ack).toHaveBeenCalledWith(delivered)
      expect(runner.state()).toMatchObject({
         handled: 1,
         failed: 0,
         failureStreak: 0,
         lastHandledAt: expect.any(String),
      })
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('item a'))
   })

   it('should send a message that does not parse to the dead queue, without logging its content', async () => {
      const { channel, definition, deliver, log, runner } = await setup()
      const delivered = message({
         id: 5,
         secret: 'hunter2',
      })

      deliver(delivered)
      await settle()

      expect(definition.handle).not.toHaveBeenCalled()
      expect(channel.sendToQueue).toHaveBeenCalledWith(
         'tasks.done.dead',
         delivered.content,
         expect.objectContaining({ headers: expect.objectContaining({ [FAILURE_HEADER]: expect.any(String) }) })
      )
      expect(channel.ack).toHaveBeenCalledWith(delivered)
      expect(runner.state().deadLettered).toBe(1)
      expect(JSON.stringify(log.error.mock.calls)).not.toContain('hunter2')
   })

   it('should retry a failed message as a copy after the back-off, then acknowledge the original', async () => {
      const { channel, definition, deliver, runner } = await setup()
      const delivered = message({ id: 'a' })

      vi.mocked(definition.handle).mockRejectedValueOnce(new Error('database is down'))
      deliver(delivered)
      await settle()

      expect(channel.sendToQueue).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
      expect(runner.state()).toMatchObject({
         failed: 1,
         failureStreak: 1,
      })

      await vi.advanceTimersByTimeAsync(1000)

      expect(channel.sendToQueue).toHaveBeenCalledWith('tasks.done', delivered.content, expect.any(Object))
      expect(retriesOf(channel)[RETRIES_HEADER]).toBe(1)
      expect(channel.ack).toHaveBeenCalledWith(delivered)
   })

   it('should use the next back-off for the next retry, and the last one when there are fewer values', async () => {
      const { channel, definition, deliver } = await setup()
      const delivered = message({ id: 'a' }, { [RETRIES_HEADER]: 1 })

      vi.mocked(definition.handle).mockRejectedValueOnce(new Error('x'))
      deliver(delivered)
      await vi.advanceTimersByTimeAsync(4999)

      expect(channel.sendToQueue).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(channel.sendToQueue).toHaveBeenCalledTimes(1)
   })

   it('should give up after the last retry: dead queue with the reason, acknowledged', async () => {
      const { channel, definition, deliver, runner, log } = await setup()
      const delivered = message({ id: 'a' }, { [RETRIES_HEADER]: 2 })

      vi.mocked(definition.handle).mockRejectedValue(new Error('still broken'))
      deliver(delivered)
      await settle()

      expect(channel.sendToQueue).toHaveBeenCalledWith(
         'tasks.done.dead',
         delivered.content,
         expect.objectContaining({
            headers: expect.objectContaining({
               [FAILURE_HEADER]: 'still broken',
               [RETRIES_HEADER]: 2,
            }),
         })
      )
      expect(channel.ack).toHaveBeenCalledWith(delivered)
      expect(runner.state().deadLettered).toBe(1)
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('gave up'))
   })

   it('should put the original back when the copy could not be published', async () => {
      const { channel, definition, deliver } = await setup()
      const delivered = message({ id: 'a' })

      channel.waitForConfirms.mockRejectedValue(new Error('nack from broker'))
      vi.mocked(definition.handle).mockRejectedValueOnce(new Error('x'))
      deliver(delivered)
      await vi.advanceTimersByTimeAsync(1000)

      expect(channel.nack).toHaveBeenCalledWith(delivered, false, true)
      expect(channel.ack).not.toHaveBeenCalled()
   })

   it('should reset the failure streak after a success', async () => {
      const { definition, deliver, runner } = await setup({
         retry: {
            max: 0,
            backoffMs: [],
         },
      })

      vi.mocked(definition.handle).mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
      deliver(message({ id: 'a' }))
      await settle()
      deliver(message({ id: 'b' }))
      await settle()

      expect(runner.state()).toMatchObject({
         failed: 1,
         handled: 1,
         failureStreak: 0,
      })
   })

   it('should consume again on a new channel after the channel closes', async () => {
      const { channel, openChannel, runner } = await setup()

      channel.emit('close')

      expect(runner.state().connected).toBe(false)

      await vi.advanceTimersByTimeAsync(100)

      expect(openChannel).toHaveBeenCalledTimes(2)
      expect(runner.state().connected).toBe(true)
   })

   it('should keep trying when the broker is down at the start', async () => {
      const { openChannel, runner, log } = await setup({}, true)

      expect(runner.state().connected).toBe(false)
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Could not consume results'))

      await vi.advanceTimersByTimeAsync(100)

      expect(openChannel).toHaveBeenCalledTimes(2)
      expect(runner.state().connected).toBe(true)
   })

   it('should stop: cancel the consumer, wait for what is being handled, and close the channel', async () => {
      const { channel, definition, deliver, runner } = await setup()
      let finish: () => void = () => undefined

      vi.mocked(definition.handle).mockImplementation(
         () =>
            new Promise<void>(resolve => {
               finish = resolve
            })
      )
      deliver(message({ id: 'a' }))
      await settle()

      const stopped = runner.stop(10_000)

      await settle()

      expect(channel.cancel).toHaveBeenCalledWith('tag')
      expect(channel.close).not.toHaveBeenCalled()

      finish()
      await stopped

      expect(channel.ack).toHaveBeenCalledTimes(1)
      expect(channel.close).toHaveBeenCalled()
      expect(runner.state().connected).toBe(false)
   })

   it('should stop after the grace even if a handler never finishes', async () => {
      const { channel, definition, deliver, runner } = await setup()

      vi.mocked(definition.handle).mockReturnValue(new Promise(() => undefined))
      deliver(message({ id: 'a' }))
      await settle()

      const stopped = runner.stop(2000)

      await vi.advanceTimersByTimeAsync(2000)
      await stopped

      expect(channel.close).toHaveBeenCalled()
   })

   it('should leave a message that waits for its retry unacknowledged when it stops, and not reconnect', async () => {
      const { channel, definition, deliver, openChannel, runner } = await setup()

      vi.mocked(definition.handle).mockRejectedValueOnce(new Error('x'))
      deliver(message({ id: 'a' }))
      await settle()
      await runner.stop(1000)
      channel.emit('close')
      await vi.advanceTimersByTimeAsync(60_000)

      expect(channel.sendToQueue).not.toHaveBeenCalled()
      expect(channel.ack).not.toHaveBeenCalled()
      expect(openChannel).toHaveBeenCalledTimes(1)
   })
})
