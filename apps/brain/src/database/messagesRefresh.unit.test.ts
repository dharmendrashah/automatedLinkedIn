import { beforeEach, describe, expect, it, vi } from 'vitest'

import { shortKey } from '@automatedLinkedIn/contracts'

import { MessagesRefresh, messagesInput, sweepDue } from './messagesRefresh'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findConversations: vi.fn(),
   request: vi.fn(),
   catalog: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findMany: mocks.findMany },
         linkedInConversation: { findMany: mocks.findConversations },
      },
   },
}))
vi.mock('./task.service', () => ({
   TaskService: {
      request: mocks.request,
      catalog: mocks.catalog,
   },
}))

const account = {
   id: 'a1',
   messagesBackfilledAt: null,
   messagesResumeSkip: null,
   messagesSweptAt: null,
}
const DONE = new Date('2026-10-20T10:00:00Z')

// What the worker announced: the version of the messages task.
const announce = (version: number) =>
   mocks.catalog.mockResolvedValue([
      {
         task: 'linkedin-messages',
         version,
      },
   ])

describe('messagesInput', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      announce(3)
      mocks.findConversations.mockResolvedValue([{ rowHash: 'aaaaaaaa' }, { rowHash: null }, { rowHash: 'bbbbbbbb' }])
   })

   it('should walk the whole inbox in batches the first time, leaving the rows brain has alone', async () => {
      await expect(messagesInput(account)).resolves.toEqual({
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
      })
      await expect(
         messagesInput({
            ...account,
            messagesResumeSkip: 100,
         })
      ).resolves.toEqual({
         skip: 100,
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
      })
   })

   it('should ask for the newest 100 rows of the account that have a hash', async () => {
      await messagesInput(account)

      expect(mocks.findConversations.mock.calls[0]?.[0]).toMatchObject({
         where: {
            accountId: 'a1',
            rowHash: { not: null },
         },
         take: 100,
      })
   })

   it('should stop at the first rows it knows once the first read is done, and go on from the place that was saved', async () => {
      const done = {
         ...account,
         messagesBackfilledAt: DONE,
      }

      await expect(messagesInput(done)).resolves.toEqual({
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
         stopAfterKnown: 3,
      })
      await expect(
         messagesInput({
            ...done,
            messagesResumeSkip: 50,
         })
      ).resolves.toEqual({
         skip: 50,
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
         stopAfterKnown: 3,
      })
   })

   it('should leave the rows brain knows alone in a sweep too, as the other reads do', async () => {
      await expect(
         messagesInput(
            {
               ...account,
               messagesBackfilledAt: DONE,
            },
            { sweep: true }
         )
      ).resolves.toEqual({
         limit: 20,
         known: ['aaaaaaaa', 'bbbbbbbb'],
      })
      expect(mocks.findConversations).toHaveBeenCalled()
   })

   it('should send an older spider the input it knows, without asking the database', async () => {
      announce(2)

      await expect(messagesInput(account)).resolves.toEqual({ limit: 50 })
      await expect(
         messagesInput({
            ...account,
            messagesBackfilledAt: DONE,
         })
      ).resolves.toEqual({ limit: 20 })
      expect(mocks.findConversations).not.toHaveBeenCalled()
   })

   it('should send the older input too when the task was not announced', async () => {
      mocks.catalog.mockResolvedValue([])

      await expect(messagesInput(account)).resolves.toEqual({ limit: 50 })
   })
})

describe('sweepDue', () => {
   const now = new Date('2026-10-24T10:00:00Z')
   const done = {
      ...account,
      messagesBackfilledAt: DONE,
   }

   it('should be due once a day after the first read, and never before it or while something is pending', () => {
      expect(sweepDue(account, now)).toBe(false)
      expect(sweepDue(done, now)).toBe(true)
      expect(
         sweepDue(
            {
               ...done,
               messagesSweptAt: new Date('2026-10-24T00:00:01Z'),
            },
            now
         )
      ).toBe(false)
      expect(
         sweepDue(
            {
               ...done,
               messagesSweptAt: new Date('2026-10-23T10:00:00Z'),
            },
            now
         )
      ).toBe(true)
      expect(
         sweepDue(
            {
               ...done,
               messagesResumeSkip: 50,
            },
            now
         )
      ).toBe(false)
   })
})

describe('MessagesRefresh.request', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      announce(2)
      mocks.request.mockResolvedValue({ id: 's' })
   })

   it('should start a read for each account of the owner, only those named when some are', async () => {
      mocks.findMany.mockResolvedValue([
         account,
         {
            ...account,
            id: 'a2',
            messagesBackfilledAt: DONE,
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
         account,
         {
            ...account,
            id: 'a2',
         },
         {
            ...account,
            id: 'a3',
         },
         {
            ...account,
            id: 'a4',
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

describe('messagesInput for a spider that reads a changed conversation down to its newest message', () => {
   const newest = 'urn:li:msg_message:(urn:li:fsd_profile:me,2-c1-m9)'
   const latest = [
      {
         conversation: shortKey('thread-1'),
         message: shortKey(newest),
      },
   ]

   beforeEach(() => {
      vi.resetAllMocks()
      announce(4)
      mocks.findConversations.mockResolvedValue([
         {
            rowHash: 'aaaaaaaa',
            linkedInId: 'thread-1',
            messages: [{ linkedInId: newest }],
         },
         {
            rowHash: 'bbbbbbbb',
            linkedInId: 'thread-2',
            messages: [],
         },
      ])
   })

   it('should walk the whole inbox in one run the first time, with the newest message of each known conversation', async () => {
      await expect(messagesInput(account)).resolves.toEqual({
         limit: 500,
         known: ['aaaaaaaa', 'bbbbbbbb'],
         latest,
      })
   })

   it('should stop a later read at the first rows it knows, and say which message each conversation ends at', async () => {
      await expect(
         messagesInput({
            ...account,
            messagesBackfilledAt: DONE,
         })
      ).resolves.toEqual({
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
         latest,
         stopAfterKnown: 3,
      })
   })

   it('should send the same keys in a sweep', async () => {
      await expect(
         messagesInput(
            {
               ...account,
               messagesBackfilledAt: DONE,
            },
            { sweep: true }
         )
      ).resolves.toEqual({
         limit: 20,
         known: ['aaaaaaaa', 'bbbbbbbb'],
         latest,
      })
   })

   it('should send an older spider the batches and the rows only, as before', async () => {
      announce(3)

      await expect(messagesInput(account)).resolves.toEqual({
         limit: 50,
         known: ['aaaaaaaa', 'bbbbbbbb'],
      })
   })
})
