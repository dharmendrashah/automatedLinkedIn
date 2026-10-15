import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TakeoverNotFoundError, TakeoverService } from './takeover.service'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findFirst: vi.fn(),
   heldIds: vi.fn(),
   latest: vi.fn(),
   send: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         spiderSession: {
            findMany: mocks.findMany,
            findFirst: mocks.findFirst,
         },
      },
   },
}))

vi.mock('core', () => ({
   TakeoverRelay: {
      heldIds: mocks.heldIds,
      latest: mocks.latest,
      send: mocks.send,
   },
}))

const ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const frame = {
   contract: 1,
   task_id: ID,
   seq: 4,
   width: 1280,
   height: 720,
   jpeg: '/9j/4AAQ',
   expires_at: '2026-10-15T10:10:00.000Z',
}

describe('TakeoverService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('listForUser', () => {
      it('should list only the held runs that belong to the user and are still running', async () => {
         mocks.heldIds.mockReturnValue([ID, 'someone-elses'])
         mocks.latest.mockReturnValue(frame)
         mocks.findMany.mockResolvedValue([
            {
               id: ID,
               task: 'linkedin-login',
               linkedInAccount: { email: 'ada@work.com' },
            },
         ])

         await expect(TakeoverService.listForUser('user-1')).resolves.toEqual([
            {
               id: ID,
               task: 'linkedin-login',
               accountEmail: 'ada@work.com',
               expiresAt: '2026-10-15T10:10:00.000Z',
            },
         ])
         expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: { in: [ID, 'someone-elses'] },
                  userId: 'user-1',
                  status: 'IN_PROGRESS',
               },
            })
         )
      })

      it('should not ask the database when nothing is held', async () => {
         mocks.heldIds.mockReturnValue([])

         await expect(TakeoverService.listForUser('user-1')).resolves.toEqual([])
         expect(mocks.findMany).not.toHaveBeenCalled()
      })
   })

   describe('frameForUser', () => {
      it('should give the newest picture of a run the user owns', async () => {
         mocks.findFirst.mockResolvedValue({ id: ID })
         mocks.latest.mockReturnValue(frame)

         await expect(TakeoverService.frameForUser('user-1', ID)).resolves.toEqual(frame)
         expect(mocks.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: ID,
                  userId: 'user-1',
                  status: 'IN_PROGRESS',
               },
            })
         )
      })

      it('should answer not found, the same as for a run that does not exist, for another user', async () => {
         mocks.findFirst.mockResolvedValue(null)
         mocks.latest.mockReturnValue(frame)

         await expect(TakeoverService.frameForUser('user-2', ID)).rejects.toBeInstanceOf(TakeoverNotFoundError)
      })

      it('should answer not found when the worker is not holding the run', async () => {
         mocks.findFirst.mockResolvedValue({ id: ID })
         mocks.latest.mockReturnValue(undefined)

         await expect(TakeoverService.frameForUser('user-1', ID)).rejects.toBeInstanceOf(TakeoverNotFoundError)
      })
   })

   describe('sendForUser', () => {
      it("should pass the owner's input on for a run they own that is held", async () => {
         mocks.findFirst.mockResolvedValue({ id: ID })
         mocks.latest.mockReturnValue(frame)
         mocks.send.mockResolvedValue(undefined)

         await TakeoverService.sendForUser('user-1', ID, {
            kind: 'click',
            x: 0.5,
            y: 0.5,
         })

         expect(mocks.send).toHaveBeenCalledWith(ID, {
            kind: 'click',
            x: 0.5,
            y: 0.5,
         })
      })

      it("should never pass on another user's input", async () => {
         mocks.findFirst.mockResolvedValue(null)

         await expect(TakeoverService.sendForUser('user-2', ID, { kind: 'done' })).rejects.toBeInstanceOf(
            TakeoverNotFoundError
         )
         expect(mocks.send).not.toHaveBeenCalled()
      })

      it('should not send anything to a run no worker is holding', async () => {
         mocks.findFirst.mockResolvedValue({ id: ID })
         mocks.latest.mockReturnValue(undefined)

         await expect(TakeoverService.sendForUser('user-1', ID, { kind: 'done' })).rejects.toBeInstanceOf(
            TakeoverNotFoundError
         )
         expect(mocks.send).not.toHaveBeenCalled()
      })
   })
})
