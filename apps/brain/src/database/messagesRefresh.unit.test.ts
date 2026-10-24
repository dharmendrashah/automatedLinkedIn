import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MessagesRefresh, messagesInput } from './messagesRefresh'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   request: vi.fn(),
}))

vi.mock('./prisma.service', () => ({ PrismaService: { client: { linkedInAccount: { findMany: mocks.findMany } } } }))
vi.mock('./task.service', () => ({ TaskService: { request: mocks.request } }))

describe('messagesInput', () => {
   const account = {
      messagesReadAt: null,
      messagesResumeSkip: null,
      messagesResumeUntil: null,
   }

   it('should read as much as the task allows the first time, and the newest conversations after', () => {
      expect(messagesInput(account)).toEqual({ limit: 50 })
      expect(
         messagesInput({
            ...account,
            messagesReadAt: new Date(),
         })
      ).toEqual({ limit: 20 })
   })

   it('should go on after what was read, to where the batch ends, when part of it is pending', () => {
      expect(
         messagesInput({
            messagesReadAt: new Date(),
            messagesResumeSkip: 14,
            messagesResumeUntil: 50,
         })
      ).toEqual({
         skip: 14,
         limit: 36,
      })
   })

   it('should ignore a pending batch that has nothing left or is half written', () => {
      const read = new Date()

      expect(
         messagesInput({
            messagesReadAt: read,
            messagesResumeSkip: 50,
            messagesResumeUntil: 50,
         })
      ).toEqual({ limit: 20 })
      expect(
         messagesInput({
            messagesReadAt: read,
            messagesResumeSkip: 14,
            messagesResumeUntil: null,
         })
      ).toEqual({ limit: 20 })
   })
})

describe('MessagesRefresh.request', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.request.mockResolvedValue({ id: 's' })
   })

   it('should start a read for each account of the owner, only those named when some are', async () => {
      mocks.findMany.mockResolvedValue([
         {
            id: 'a1',
            messagesReadAt: null,
         },
         {
            id: 'a2',
            messagesReadAt: new Date(),
         },
      ])

      await expect(MessagesRefresh.request('u1', ['a1', 'a2'])).resolves.toEqual({
         started: 2,
         skipped: [],
      })

      expect(mocks.findMany.mock.calls[0]?.[0].where).toEqual({
         userId: 'u1',
         id: { in: ['a1', 'a2'] },
      })
      expect(mocks.request).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-messages',
         accountId: 'a1',
         trigger: 'manual',
         input: { limit: 50 },
      })
      expect(mocks.request).toHaveBeenCalledWith(
         expect.objectContaining({
            accountId: 'a2',
            input: { limit: 20 },
         })
      )
   })

   it('should read every account of the owner when none is named', async () => {
      mocks.findMany.mockResolvedValue([])

      await MessagesRefresh.request('u1')

      expect(mocks.findMany.mock.calls[0]?.[0].where).toEqual({ userId: 'u1' })
   })

   it('should leave out an account that cannot start, with the reason, and go on with the others', async () => {
      mocks.findMany.mockResolvedValue([
         {
            id: 'a1',
            messagesReadAt: null,
         },
         {
            id: 'a2',
            messagesReadAt: null,
         },
         {
            id: 'a3',
            messagesReadAt: null,
         },
         {
            id: 'a4',
            messagesReadAt: null,
         },
      ])
      mocks.request
         .mockRejectedValueOnce(new TaskRefusedError('A LinkedIn task is already running.'))
         .mockRejectedValueOnce(new TaskUnavailableError())
         .mockRejectedValueOnce(new Error('the database said no'))
         .mockResolvedValueOnce({ id: 's' })

      const result = await MessagesRefresh.request('u1')

      expect(result.started).toBe(1)
      expect(result.skipped).toEqual([
         {
            accountId: 'a1',
            reason: 'A LinkedIn task is already running.',
         },
         {
            accountId: 'a2',
            reason: expect.stringContaining('not available'),
         },
         {
            accountId: 'a3',
            reason: 'Something went wrong. Try again in a moment.',
         },
      ])
      expect(JSON.stringify(result)).not.toContain('database said no')
   })
})
