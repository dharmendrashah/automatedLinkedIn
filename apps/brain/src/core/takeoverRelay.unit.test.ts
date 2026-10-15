import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TAKEOVER_FRAME_QUEUE, TAKEOVER_FRAME_TTL_MS, TAKEOVER_INPUT_EXCHANGE } from '@automatedLinkedIn/contracts'

import { TakeoverRateError, TakeoverRelay } from './takeoverRelay'

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
const OTHER_ID = '1e0a6c7f-1d69-4c5e-8e5c-0c9a6c1a7b22'

const frame = (taskId = TASK_ID, seq = 0) => ({
   contract: 1 as const,
   task_id: taskId,
   seq,
   width: 1280,
   height: 720,
   jpeg: '/9j/4AAQ',
   expires_at: '2026-10-15T10:10:00.000Z',
})

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

const NOW = Date.parse('2026-10-15T10:00:00.000Z')

describe('TakeoverRelay', () => {
   beforeEach(() => {
      vi.restoreAllMocks()
      TakeoverRelay.reset()
   })

   describe('the pictures the worker sends', () => {
      it('should keep only the newest picture of each run', () => {
         TakeoverRelay.hold(frame(TASK_ID, 1), NOW)
         TakeoverRelay.hold(frame(TASK_ID, 2), NOW)
         TakeoverRelay.hold(frame(OTHER_ID, 7), NOW)

         expect(TakeoverRelay.latest(TASK_ID, NOW)?.seq).toBe(2)
         expect(TakeoverRelay.latest(OTHER_ID, NOW)?.seq).toBe(7)
         expect(TakeoverRelay.heldIds(NOW).sort()).toEqual([TASK_ID, OTHER_ID].sort())
      })

      it('should not let an older picture replace a newer one that arrived first', () => {
         TakeoverRelay.hold(frame(TASK_ID, 5), NOW)
         TakeoverRelay.hold(frame(TASK_ID, 4), NOW)

         expect(TakeoverRelay.latest(TASK_ID, NOW)?.seq).toBe(5)
      })

      it('should forget a run whose worker stopped sending, since it stopped waiting', () => {
         TakeoverRelay.hold(frame(), NOW)

         expect(TakeoverRelay.latest(TASK_ID, NOW + TAKEOVER_FRAME_TTL_MS - 1)).toBeDefined()
         expect(TakeoverRelay.latest(TASK_ID, NOW + TAKEOVER_FRAME_TTL_MS + 1)).toBeUndefined()
         expect(TakeoverRelay.heldIds(NOW + TAKEOVER_FRAME_TTL_MS + 1)).toEqual([])
      })

      it('should forget the run once it ended', () => {
         TakeoverRelay.hold(frame(), NOW)
         TakeoverRelay.release(TASK_ID)

         expect(TakeoverRelay.latest(TASK_ID, NOW)).toBeUndefined()
      })
   })

   describe('consume', () => {
      it('should take pictures from the broker, and drop what does not match the contract', async () => {
         const channel = fakeChannel()

         mocks.channel.mockResolvedValue(channel)

         await TakeoverRelay.consume({ error: vi.fn() })

         expect(channel.assertQueue).toHaveBeenCalledWith(
            TAKEOVER_FRAME_QUEUE,
            expect.objectContaining({ durable: true })
         )
         expect(channel.consume).toHaveBeenCalledWith(TAKEOVER_FRAME_QUEUE, expect.any(Function), { noAck: false })

         const [, handler] = channel.consume.mock.calls[0] as [string, (message: unknown) => Promise<void>]

         await handler({
            content: Buffer.from(JSON.stringify(frame(TASK_ID, 3))),
            fields: {},
         })
         await handler({
            content: Buffer.from('{"nope":1}'),
            fields: {},
         })

         expect(TakeoverRelay.latest(TASK_ID, Date.now())?.seq).toBe(3)
         expect(channel.ack).toHaveBeenCalledTimes(1)
         expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
      })
   })

   describe('send', () => {
      it("should hand the owner's input to the one worker waiting on that run, and keep nothing", async () => {
         const channel = fakeChannel()

         mocks.confirmChannel.mockResolvedValue(channel)

         await TakeoverRelay.send(TASK_ID, {
            kind: 'click',
            x: 0.5,
            y: 0.5,
         })

         expect(channel.publish).toHaveBeenCalledWith(
            TAKEOVER_INPUT_EXCHANGE,
            TASK_ID,
            Buffer.from(
               JSON.stringify({
                  kind: 'click',
                  x: 0.5,
                  y: 0.5,
               })
            ),
            expect.objectContaining({ persistent: false })
         )
      })

      it('should not log what the owner typed', async () => {
         const channel = fakeChannel()
         const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
         const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

         mocks.confirmChannel.mockResolvedValue(channel)

         await TakeoverRelay.send(TASK_ID, {
            kind: 'type',
            text: 'secret-code-123',
         })

         expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain('secret-code-123')
      })

      it('should refuse a run that is sent far more inputs than a person could make, so a bug cannot flood a browser', async () => {
         const channel = fakeChannel()

         mocks.confirmChannel.mockResolvedValue(channel)

         let refused = 0

         for (let index = 0; index < 60; index += 1) {
            try {
               await TakeoverRelay.send(
                  TASK_ID,
                  {
                     kind: 'scroll',
                     dy: 1,
                  },
                  NOW
               )
            } catch (error) {
               if (error instanceof TakeoverRateError) {
                  refused += 1
               }
            }
         }

         expect(refused).toBeGreaterThan(0)
         expect(channel.publish.mock.calls.length).toBeLessThanOrEqual(30)
      })

      it('should allow inputs again in the next second', async () => {
         const channel = fakeChannel()

         mocks.confirmChannel.mockResolvedValue(channel)

         for (let index = 0; index < 30; index += 1) {
            await TakeoverRelay.send(TASK_ID, { kind: 'done' }, NOW)
         }

         await expect(TakeoverRelay.send(TASK_ID, { kind: 'done' }, NOW + 1500)).resolves.toBeUndefined()
      })
   })
})
