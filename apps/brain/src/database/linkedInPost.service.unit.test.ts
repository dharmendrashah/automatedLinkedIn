import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LinkedInPostService } from './linkedInPost.service'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findFirst: vi.fn(),
   count: vi.fn(),
   createMany: vi.fn(),
   updateMany: vi.fn(),
   update: vi.fn(),
   deleteSnapshots: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         pageSnapshot: { deleteMany: mocks.deleteSnapshots },
         linkedInPost: {
            findMany: mocks.findMany,
            findFirst: mocks.findFirst,
            count: mocks.count,
            createMany: mocks.createMany,
            updateMany: mocks.updateMany,
            update: mocks.update,
         },
      },
   },
}))

const post = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${slug.replace('activity-', '')}`,
})

describe('LinkedInPostService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('addMany', () => {
      it('should create the new posts, restore the archived ones and skip the live ones for the owner', async () => {
         mocks.findMany.mockResolvedValueOnce([
            {
               slug: 'activity-1',
               archivedAt: null,
            },
            {
               slug: 'activity-2',
               archivedAt: new Date(),
            },
         ])
         mocks.updateMany.mockResolvedValueOnce({ count: 1 })
         mocks.createMany.mockResolvedValueOnce({ count: 1 })

         const result = await LinkedInPostService.addMany('u1', [
            post('activity-3'),
            post('activity-1'),
            post('activity-2'),
         ])

         expect(result).toEqual({
            created: 1,
            restored: 1,
            skipped: 1,
         })
         expect(mocks.updateMany).toHaveBeenCalledWith({
            where: {
               userId: 'u1',
               slug: { in: ['activity-2'] },
            },
            data: { archivedAt: null },
         })
         expect(mocks.createMany).toHaveBeenCalledWith({
            data: [
               {
                  userId: 'u1',
                  ...post('activity-3'),
                  expandedUrl: null,
               },
            ],
            skipDuplicates: true,
         })
      })
   })

   describe('list', () => {
      it('should scope to the owner, hide archived rows, filter by status and search the link', async () => {
         mocks.findMany.mockResolvedValueOnce([{ id: 'p1' }])
         mocks.count.mockResolvedValueOnce(30)

         const result = await LinkedInPostService.list('u1', {
            search: '7123',
            status: 'PROCESSED',
            page: 2,
            pageSize: 25,
         })

         const { where, skip, take, orderBy } = mocks.findMany.mock.calls[0][0] as {
            where: { userId: string; archivedAt: null; status: string; OR: Record<string, unknown>[] }
            skip: number
            take: number
            orderBy: unknown
         }

         expect(result).toEqual({
            items: [{ id: 'p1' }],
            total: 30,
         })
         expect(where).toMatchObject({
            userId: 'u1',
            archivedAt: null,
            status: 'PROCESSED',
         })
         expect(where.OR.map(clause => Object.keys(clause)[0])).toEqual(['slug'])
         expect([skip, take]).toEqual([25, 25])
         expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
      })
   })

   describe('getForUser', () => {
      it('should look the post up by id and owner', async () => {
         mocks.findFirst.mockResolvedValueOnce({ id: 'p1' })

         await expect(LinkedInPostService.getForUser('u1', 'p1')).resolves.toEqual({ id: 'p1' })
         expect(mocks.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  userId: 'u1',
               },
            })
         )
      })
   })

   describe('updateForUser, archiveForUser and restoreForUser', () => {
      it('should change a post only when it belongs to the user', async () => {
         mocks.update.mockResolvedValue({ id: 'p1' })

         await LinkedInPostService.updateForUser('u1', 'p1', { status: 'PROCESSED' })
         await LinkedInPostService.restoreForUser('u1', 'p1')
         await LinkedInPostService.archiveForUser('u1', 'p1')

         const calls = mocks.update.mock.calls.map(
            ([args]) => args as { where: unknown; data: Record<string, unknown> }
         )

         expect(calls.map(call => call.where)).toEqual(
            Array(3).fill({
               id: 'p1',
               userId: 'u1',
            })
         )
         expect(calls[0].data).toEqual({ status: 'PROCESSED' })
         expect(calls[1].data).toEqual({ archivedAt: null })
         expect(calls[2].data.archivedAt).toBeInstanceOf(Date)
      })

      it('should return null for a post that is missing or not the users', async () => {
         mocks.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }))

         await expect(LinkedInPostService.archiveForUser('u2', 'p1')).resolves.toBeNull()
      })
   })
})
