import { describe, expect, it, vi } from 'vitest'

import { VALIDATED_KEY, VALIDATED_QUEUE, VALIDATE_KEY, VALIDATE_QUEUE } from '@automatedLinkedIn/contracts'

import {
   DEAD_EXCHANGE,
   DEAD_QUEUE,
   DELIVERY_LIMIT,
   EXCHANGE,
   RESULT_KEY,
   RESULT_QUEUE,
   TASK_KEY,
   TASK_QUEUE,
   assertTopology,
} from './topology'

describe('assertTopology', () => {
   const channel = () => ({
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
   })

   it('should declare durable direct exchanges', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      expect(fake.assertExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true })
      expect(fake.assertExchange).toHaveBeenCalledWith(DEAD_EXCHANGE, 'direct', { durable: true })
   })

   it('should declare the task queue durable, as a quorum queue with a delivery limit and a dead-letter exchange', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      expect(fake.assertQueue).toHaveBeenCalledWith(TASK_QUEUE, {
         durable: true,
         arguments: {
            'x-queue-type': 'quorum',
            'x-delivery-limit': DELIVERY_LIMIT,
            'x-dead-letter-exchange': DEAD_EXCHANGE,
         },
      })
   })

   it('should keep every queue durable', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      for (const [, options] of fake.assertQueue.mock.calls) {
         expect(options).toMatchObject({ durable: true })
      }
   })

   it('should bind tasks, results and dead letters with their routing keys', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      expect(fake.bindQueue).toHaveBeenCalledWith(TASK_QUEUE, EXCHANGE, TASK_KEY)
      expect(fake.bindQueue).toHaveBeenCalledWith(RESULT_QUEUE, EXCHANGE, RESULT_KEY)
      expect(fake.bindQueue).toHaveBeenCalledWith(DEAD_QUEUE, DEAD_EXCHANGE, TASK_KEY)
   })

   it('should also declare the queues of account validation, so either side can start first', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      expect(fake.assertQueue).toHaveBeenCalledWith(VALIDATE_QUEUE, expect.anything())
      expect(fake.assertQueue).toHaveBeenCalledWith(VALIDATED_QUEUE, expect.anything())
      expect(fake.bindQueue).toHaveBeenCalledWith(VALIDATE_QUEUE, EXCHANGE, VALIDATE_KEY)
      expect(fake.bindQueue).toHaveBeenCalledWith(VALIDATED_QUEUE, EXCHANGE, VALIDATED_KEY)
   })

   it('should expire and cap results so an unread queue cannot grow forever', async () => {
      const fake = channel()

      await assertTopology(fake as never)

      expect(fake.assertQueue).toHaveBeenCalledWith(
         RESULT_QUEUE,
         expect.objectContaining({
            arguments: {
               'x-message-ttl': expect.any(Number),
               'x-max-length': expect.any(Number),
            },
         })
      )
   })

   it('should use the names from the specification', () => {
      expect(EXCHANGE).toBe('scraping.exchange')
      expect(TASK_QUEUE).toBe('linkedin.requests')
      expect(TASK_KEY).toBe('linkedin.task')
      expect(RESULT_KEY).toBe('task.result')
   })
})
