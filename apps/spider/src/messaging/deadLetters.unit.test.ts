import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'

import { TASK_DEAD_QUEUE, type TaskCommand } from '@automatedLinkedIn/contracts'

import { answerDeadTasks, drainDeadTasks } from './deadLetters'

const command: TaskCommand = {
   contract: 1,
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   user_id: 'user-1',
   task: 'linkedin-browse',
   task_version: 1,
   requested_at: '2026-10-28T10:00:00.000Z',
   trigger: 'automatic',
   input: {},
}

const message = (body: unknown) => ({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) })

describe('answerDeadTasks', () => {
   let deliver: ((msg: unknown) => Promise<void>) | undefined
   let channel: {
      prefetch: Mock
      consume: Mock
      cancel: Mock
      ack: Mock
      nack: Mock
   }
   let log: { info: Mock; error: Mock }
   let answer: Mock<(task: TaskCommand) => Promise<void>>

   beforeEach(() => {
      deliver = undefined
      channel = {
         prefetch: vi.fn().mockResolvedValue(undefined),
         consume: vi.fn(async (_queue: string, callback: (msg: unknown) => Promise<void>) => {
            deliver = callback

            return { consumerTag: 'tag-1' }
         }),
         cancel: vi.fn().mockResolvedValue(undefined),
         ack: vi.fn(),
         nack: vi.fn(),
      }
      log = {
         info: vi.fn(),
         error: vi.fn(),
      }
      answer = vi.fn().mockResolvedValue(undefined)
   })

   it('should answer a task from the dead-letter queue, then acknowledge it', async () => {
      await answerDeadTasks(channel as never, answer, log)

      expect(channel.consume).toHaveBeenCalledWith(TASK_DEAD_QUEUE, expect.any(Function), { noAck: false })

      const dead = message(command)
      await deliver?.(dead)

      expect(answer).toHaveBeenCalledWith(command)
      expect(channel.ack).toHaveBeenCalledWith(dead)
   })

   it('should put the message back when the answer cannot be sent', async () => {
      answer.mockRejectedValue(new Error('broker down'))
      await answerDeadTasks(channel as never, answer, log)

      const dead = message(command)
      await deliver?.(dead)

      expect(channel.nack).toHaveBeenCalledWith(dead, false, true)
      expect(channel.ack).not.toHaveBeenCalled()
   })

   it('should drop a message that is not a task, without logging what it held', async () => {
      await answerDeadTasks(channel as never, answer, log)

      const dead = message('not json, secret-value')
      await deliver?.(dead)

      expect(answer).not.toHaveBeenCalled()
      expect(channel.ack).toHaveBeenCalledWith(dead)
      expect(JSON.stringify(log.error.mock.calls)).not.toContain('secret-value')
   })
})

describe('drainDeadTasks', () => {
   let channel: { get: Mock; ack: Mock; nack: Mock }
   let log: { info: Mock; error: Mock }
   let answer: Mock<(task: TaskCommand) => Promise<void>>

   beforeEach(() => {
      channel = {
         get: vi.fn(),
         ack: vi.fn(),
         nack: vi.fn(),
      }
      log = {
         info: vi.fn(),
         error: vi.fn(),
      }
      answer = vi.fn().mockResolvedValue(undefined)
   })

   it('should answer every dead task until the queue is empty, acknowledging each one', async () => {
      const first = message(command)
      const second = message({
         ...command,
         task_id: '6f1f4f2a-0c58-4b4e-9d4b-9b8f5b0f6a22',
      })
      channel.get.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(false)

      await drainDeadTasks(channel as never, answer, log)

      expect(channel.get).toHaveBeenCalledWith(TASK_DEAD_QUEUE, { noAck: false })
      expect(answer.mock.calls.map(([task]) => task.task_id)).toEqual([
         command.task_id,
         '6f1f4f2a-0c58-4b4e-9d4b-9b8f5b0f6a22',
      ])
      expect(channel.ack.mock.calls.map(([msg]) => msg)).toEqual([first, second])
   })

   it('should stop at the first task whose answer cannot be sent, and put it back', async () => {
      const dead = message(command)
      channel.get.mockResolvedValueOnce(dead).mockResolvedValueOnce(message(command))
      answer.mockRejectedValue(new Error('broker down'))

      await drainDeadTasks(channel as never, answer, log)

      expect(channel.nack).toHaveBeenCalledWith(dead, false, true)
      expect(channel.get).toHaveBeenCalledTimes(1)
      expect(channel.ack).not.toHaveBeenCalled()
   })
})
