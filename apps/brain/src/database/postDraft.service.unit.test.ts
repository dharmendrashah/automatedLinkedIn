import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError } from './conflict'
import { PostDraftService } from './postDraft.service'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findFirst: vi.fn(),
   count: vi.fn(),
   create: vi.fn(),
   update: vi.fn(),
   deleteMany: vi.fn(),
   findAccount: vi.fn(),
   removeFiles: vi.fn(),
}))

vi.mock('core', () => ({ PostFiles: { remove: mocks.removeFiles } }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findFirst: mocks.findAccount },
         postDraft: {
            findMany: mocks.findMany,
            findFirst: mocks.findFirst,
            count: mocks.count,
            create: mocks.create,
            update: mocks.update,
            deleteMany: mocks.deleteMany,
         },
      },
   },
}))

const blocks = [
   {
      id: 't1',
      type: 'TEXT',
      text: 'Hello',
   },
]

const FILE = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const KEY = `posts/u1/${FILE}/slides.pdf`

const withFile = (key?: string) => [
   ...blocks,
   {
      id: 'd1',
      type: 'DOCUMENT',
      file: {
         id: FILE,
         name: 'slides.pdf',
         bytes: 10,
         ...(key && { key }),
      },
   },
]

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
   id,
   accountId: 'a1',
   blocks,
   audience: 'ANYONE',
   comments: 'ANYONE',
   plannedAt: null,
   plannedZone: null,
   createdAt: new Date('2026-10-25T10:00:00.000Z'),
   updatedAt: new Date('2026-10-25T10:05:00.000Z'),
   ...overrides,
})

const input = {
   accountId: 'a1',
   blocks: blocks as never,
   audience: 'ANYONE' as const,
   comments: 'ANYONE' as const,
   plannedAt: null,
   plannedZone: null,
}

describe('PostDraftService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.removeFiles.mockResolvedValue(0)
   })

   describe('list', () => {
      it('should list only the owner drafts, newest first, with times as ISO text', async () => {
         mocks.findMany.mockResolvedValueOnce([row('d1')])

         const result = await PostDraftService.list('u1')

         expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: { userId: 'u1' },
               orderBy: { updatedAt: 'desc' },
            })
         )
         expect(result).toEqual({
            items: [
               {
                  id: 'd1',
                  accountId: 'a1',
                  blocks,
                  audience: 'ANYONE',
                  comments: 'ANYONE',
                  plannedAt: null,
                  plannedZone: null,
                  createdAt: '2026-10-25T10:00:00.000Z',
                  updatedAt: '2026-10-25T10:05:00.000Z',
               },
            ],
            unreadable: 0,
         })
      })

      it('should leave out a draft whose blocks no longer fit the rules and count it', async () => {
         mocks.findMany.mockResolvedValueOnce([row('d1'), row('d2', { blocks: [{ type: 'SOMETHING' }] })])

         const result = await PostDraftService.list('u1')

         expect(result.items.map(({ id }) => id)).toEqual(['d1'])
         expect(result.unreadable).toBe(1)
      })
   })

   describe('get', () => {
      it('should find a draft only for its owner', async () => {
         mocks.findFirst.mockResolvedValueOnce(row('d1'))

         expect((await PostDraftService.get('u1', 'd1'))?.id).toBe('d1')
         expect(mocks.findFirst).toHaveBeenCalledWith({
            where: {
               id: 'd1',
               userId: 'u1',
            },
         })
      })

      it('should answer nothing for a missing or unreadable draft', async () => {
         mocks.findFirst.mockResolvedValueOnce(null)
         mocks.findFirst.mockResolvedValueOnce(row('d2', { blocks: 'broken' }))

         expect(await PostDraftService.get('u1', 'x')).toBeNull()
         expect(await PostDraftService.get('u1', 'd2')).toBeNull()
      })
   })

   describe('save', () => {
      it('should create a draft for an account of the owner', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.count.mockResolvedValueOnce(3)
         mocks.create.mockResolvedValueOnce(row('d9'))

         const saved = await PostDraftService.save('u1', input)

         expect(mocks.findAccount).toHaveBeenCalledWith({
            where: {
               id: 'a1',
               userId: 'u1',
            },
            select: { id: true },
         })
         expect(mocks.create).toHaveBeenCalledWith({
            data: {
               userId: 'u1',
               accountId: 'a1',
               blocks,
               audience: 'ANYONE',
               comments: 'ANYONE',
               plannedAt: null,
               plannedZone: null,
            },
         })
         expect(saved?.id).toBe('d9')
      })

      it('should refuse an account that is not the owner, and write nothing', async () => {
         mocks.findAccount.mockResolvedValueOnce(null)

         expect(await PostDraftService.save('u1', input)).toBeNull()
         expect(mocks.create).not.toHaveBeenCalled()
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should refuse a new draft past the limit with a sentence the owner can read', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.count.mockResolvedValueOnce(200)

         await expect(PostDraftService.save('u1', input)).rejects.toBeInstanceOf(ConflictError)
         expect(mocks.create).not.toHaveBeenCalled()
      })

      it('should update a draft naming the owner, with its planned time as a date', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.findFirst.mockResolvedValueOnce(row('d1'))
         mocks.update.mockResolvedValueOnce(row('d1', { plannedAt: new Date('2026-11-03T09:00:00.000Z') }))

         const saved = await PostDraftService.save('u1', {
            ...input,
            id: 'd1',
            audience: 'CONNECTIONS',
            plannedAt: '2026-11-03T09:00:00.000Z',
            plannedZone: 'Asia/Kolkata',
         })

         expect(mocks.update).toHaveBeenCalledWith({
            where: {
               id: 'd1',
               userId: 'u1',
            },
            data: {
               accountId: 'a1',
               blocks,
               audience: 'CONNECTIONS',
               comments: 'ANYONE',
               plannedAt: new Date('2026-11-03T09:00:00.000Z'),
               plannedZone: 'Asia/Kolkata',
            },
         })
         expect(saved?.plannedAt).toBe('2026-11-03T09:00:00.000Z')
         expect(mocks.count).not.toHaveBeenCalled()
      })

      it('should answer nothing when the draft to update is not the owner', async () => {
         mocks.findAccount.mockResolvedValue({ id: 'a1' })
         mocks.findFirst.mockResolvedValueOnce(null)

         expect(
            await PostDraftService.save('u1', {
               ...input,
               id: 'other',
            })
         ).toBeNull()
         expect(mocks.update).not.toHaveBeenCalled()

         mocks.findFirst.mockResolvedValueOnce(row('other'))
         mocks.update.mockRejectedValueOnce({ code: 'P2025' })

         expect(
            await PostDraftService.save('u1', {
               ...input,
               id: 'other',
            })
         ).toBeNull()
      })

      it('should keep a key that is where the owner upload ends up', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.count.mockResolvedValueOnce(0)
         mocks.create.mockResolvedValueOnce(row('d9', { blocks: withFile(KEY) }))

         await PostDraftService.save('u1', {
            ...input,
            blocks: withFile(KEY) as never,
         })

         expect(mocks.create).toHaveBeenCalled()
      })

      it('should refuse a key that points anywhere else, and write nothing', async () => {
         mocks.findAccount.mockResolvedValue({ id: 'a1' })

         for (const key of [
            `posts/other/${FILE}/slides.pdf`,
            `posts/u1/${FILE}/other.pdf`,
            `kept/u1/a/${FILE}/slides.pdf`,
         ]) {
            await expect(
               PostDraftService.save('u1', {
                  ...input,
                  blocks: withFile(key) as never,
               })
            ).rejects.toBeInstanceOf(ConflictError)
         }

         expect(mocks.create).not.toHaveBeenCalled()
      })

      it('should delete the files the draft no longer carries, and only those', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.findFirst.mockResolvedValueOnce(row('d1', { blocks: withFile(KEY) }))
         mocks.update.mockResolvedValueOnce(row('d1'))

         await PostDraftService.save('u1', {
            ...input,
            id: 'd1',
         })

         expect(mocks.removeFiles).toHaveBeenCalledWith([KEY])

         mocks.removeFiles.mockClear()
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.findFirst.mockResolvedValueOnce(row('d1', { blocks: withFile(KEY) }))
         mocks.update.mockResolvedValueOnce(row('d1', { blocks: withFile(KEY) }))

         await PostDraftService.save('u1', {
            ...input,
            id: 'd1',
            blocks: withFile(KEY) as never,
         })

         expect(mocks.removeFiles).not.toHaveBeenCalled()
      })

      it('should still save when the bucket cannot delete a file', async () => {
         mocks.findAccount.mockResolvedValueOnce({ id: 'a1' })
         mocks.findFirst.mockResolvedValueOnce(row('d1', { blocks: withFile(KEY) }))
         mocks.update.mockResolvedValueOnce(row('d1'))
         mocks.removeFiles.mockRejectedValueOnce(new Error('denied'))

         await expect(
            PostDraftService.save('u1', {
               ...input,
               id: 'd1',
            })
         ).resolves.toMatchObject({ id: 'd1' })
      })
   })

   describe('remove', () => {
      it('should delete only the owner draft, say whether one was deleted, and delete its files', async () => {
         mocks.findFirst.mockResolvedValueOnce(row('d1', { blocks: withFile(KEY) }))
         mocks.deleteMany.mockResolvedValueOnce({ count: 1 })
         mocks.findFirst.mockResolvedValueOnce(null)
         mocks.deleteMany.mockResolvedValueOnce({ count: 0 })

         expect(await PostDraftService.remove('u1', 'd1')).toBe(true)
         expect(await PostDraftService.remove('u1', 'foreign')).toBe(false)
         expect(mocks.deleteMany).toHaveBeenCalledWith({
            where: {
               id: 'd1',
               userId: 'u1',
            },
         })
         expect(mocks.removeFiles).toHaveBeenCalledTimes(1)
         expect(mocks.removeFiles).toHaveBeenCalledWith([KEY])
      })
   })

   describe('removeFilesOfAccount', () => {
      it('should delete the files of every draft of the account', async () => {
         mocks.findMany.mockResolvedValueOnce([{ blocks: withFile(KEY) }, { blocks }, { blocks: 'broken' }])

         await PostDraftService.removeFilesOfAccount('u1', 'a1')

         expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userId: 'u1',
                  accountId: 'a1',
               },
            })
         )
         expect(mocks.removeFiles).toHaveBeenCalledWith([KEY])
      })

      it('should fail, so the account stays, when a file cannot be deleted', async () => {
         mocks.findMany.mockResolvedValueOnce([{ blocks: withFile(KEY) }])
         mocks.removeFiles.mockResolvedValueOnce(1)

         await expect(PostDraftService.removeFilesOfAccount('u1', 'a1')).rejects.toThrow('could not be deleted')
      })

      it('should call the bucket for nothing when no draft has a file', async () => {
         mocks.findMany.mockResolvedValueOnce([{ blocks }])

         await PostDraftService.removeFilesOfAccount('u1', 'a1')

         expect(mocks.removeFiles).not.toHaveBeenCalled()
      })
   })
})
