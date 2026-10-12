import { describe, expect, it, vi } from 'vitest'

import {
   DEAD_EXCHANGE,
   EXCHANGE,
   TASK_DEAD_QUEUE,
   TASK_DONE_KEY,
   TASK_DONE_QUEUE,
   TASK_KEY,
   TASK_QUEUE,
   accountIdSchema,
   assertAccountTopology,
} from './index'

describe('accountIdSchema', () => {
   it.each(['0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b', 'acc1', 'a.b_c-d'])('should accept %s', id => {
      expect(accountIdSchema.safeParse(id).success).toBe(true)
   })

   it.each(['', '.', '..', '../x', 'a/b', '-lead', 'a b', 'a'.repeat(101)])('should reject %j', id => {
      expect(accountIdSchema.safeParse(id).success).toBe(false)
   })
})

describe('assertAccountTopology', () => {
   const setup = () => ({
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
   })

   it('should declare the exchanges so either side can start first', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.assertExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true })
      expect(channel.assertExchange).toHaveBeenCalledWith(DEAD_EXCHANGE, 'direct', { durable: true })
   })

   it('should declare a dead-lettered quorum queue for tasks and a durable queue for results', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.assertQueue).toHaveBeenCalledWith(
         TASK_QUEUE,
         expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({
               'x-queue-type': 'quorum',
               'x-dead-letter-exchange': DEAD_EXCHANGE,
            }),
         })
      )
      expect(channel.assertQueue).toHaveBeenCalledWith(TASK_DEAD_QUEUE, { durable: true })
      expect(channel.assertQueue).toHaveBeenCalledWith(
         TASK_DONE_QUEUE,
         expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({ 'x-message-ttl': expect.any(Number) }),
         })
      )
   })

   it('should bind each queue to its routing key', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.bindQueue).toHaveBeenCalledWith(TASK_QUEUE, EXCHANGE, TASK_KEY)
      expect(channel.bindQueue).toHaveBeenCalledWith(TASK_DEAD_QUEUE, DEAD_EXCHANGE, TASK_KEY)
      expect(channel.bindQueue).toHaveBeenCalledWith(TASK_DONE_QUEUE, EXCHANGE, TASK_DONE_KEY)
   })

   it('should be safe to run twice, with the same arguments both times', async () => {
      const channel = setup()

      await assertAccountTopology(channel)
      await assertAccountTopology(channel)

      const [first, second] = channel.assertQueue.mock.calls.filter(([name]) => name === TASK_QUEUE)

      expect(first).toEqual(second)
   })
})
