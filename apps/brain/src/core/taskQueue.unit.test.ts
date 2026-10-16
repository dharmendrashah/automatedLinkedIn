import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EXCHANGE, TASK_KEY } from '@automatedLinkedIn/contracts'

import { TaskQueue } from './taskQueue'

const mocks = vi.hoisted(() => ({ confirmChannel: vi.fn() }))

vi.mock('./messageBroker', () => ({ MessageBroker: { confirmChannel: mocks.confirmChannel } }))

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

const fakeChannel = () =>
   Object.assign(new EventEmitter(), {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockReturnValue(true),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
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
