import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LinkedInPostService } from './linkedInPost.service'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findFirst: vi.fn(),
   createMany: vi.fn(),
   updateMany: vi.fn(),
   update: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInPost: {
            findMany: mocks.findMany,
            findFirst: mocks.findFirst,
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

   describe('updateForUser', () => {
      it('should change a post only when it belongs to the user', async () => {
         mocks.update.mockResolvedValue({ id: 'p1' })

         await LinkedInPostService.updateForUser('u1', 'p1', { status: 'PROCESSED' })

         expect(mocks.update).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  userId: 'u1',
               },
               data: { status: 'PROCESSED' },
            })
         )
      })

      it('should return null for a post that is missing or not the users', async () => {
         mocks.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }))

         await expect(LinkedInPostService.updateForUser('u2', 'p1', { status: 'PROCESSED' })).resolves.toBeNull()
      })
   })
})
