import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LinkedInProfileService } from './linkedInProfile.service'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   findFirst: vi.fn(),
   count: vi.fn(),
   createMany: vi.fn(),
   updateMany: vi.fn(),
   update: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInProfile: {
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

const profile = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})

describe('LinkedInProfileService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('addMany', () => {
      it('should create the new profiles, restore the archived ones and skip the live ones', async () => {
         mocks.findMany.mockResolvedValueOnce([
            {
               slug: 'live',
               archivedAt: null,
            },
            {
               slug: 'gone',
               archivedAt: new Date(),
            },
         ])
         mocks.updateMany.mockResolvedValueOnce({ count: 1 })
         mocks.createMany.mockResolvedValueOnce({ count: 1 })

         const result = await LinkedInProfileService.addMany('u1', [profile('new'), profile('live'), profile('gone')])

         expect(result).toEqual({
            created: 1,
            restored: 1,
            skipped: 1,
         })
         expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userId: 'u1',
                  slug: { in: ['new', 'live', 'gone'] },
               },
            })
         )
         expect(mocks.updateMany).toHaveBeenCalledWith({
            where: {
               userId: 'u1',
               slug: { in: ['gone'] },
            },
            data: { archivedAt: null },
         })
         expect(mocks.createMany).toHaveBeenCalledWith({
            data: [
               {
                  userId: 'u1',
                  ...profile('new'),
               },
            ],
            skipDuplicates: true,
         })
      })

      it('should count a profile saved by a concurrent paste as skipped', async () => {
         mocks.findMany.mockResolvedValueOnce([])
         mocks.createMany.mockResolvedValueOnce({ count: 0 })

         await expect(LinkedInProfileService.addMany('u1', [profile('race')])).resolves.toEqual({
            created: 0,
            restored: 0,
            skipped: 1,
         })
      })

      it('should not touch the database for an empty list', async () => {
         await expect(LinkedInProfileService.addMany('u1', [])).resolves.toEqual({
            created: 0,
            restored: 0,
            skipped: 0,
         })
         expect(mocks.findMany).not.toHaveBeenCalled()
      })
   })

   describe('list', () => {
      beforeEach(() => {
         mocks.findMany.mockResolvedValueOnce([{ id: 'p1' }])
         mocks.count.mockResolvedValueOnce(30)
      })

      it('should scope to the owner, hide archived rows and page newest first', async () => {
         const result = await LinkedInProfileService.list('u1', {
            page: 2,
            pageSize: 25,
         })

         expect(result).toEqual({
            items: [{ id: 'p1' }],
            total: 30,
         })
         expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userId: 'u1',
                  archivedAt: null,
               },
               orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
               skip: 25,
               take: 25,
            })
         )
         expect(mocks.count).toHaveBeenCalledWith({
            where: {
               userId: 'u1',
               archivedAt: null,
            },
         })
      })

      it('should apply search, status, label and added filters and include archived rows on request', async () => {
         const addedSince = new Date('2026-10-12T00:00:00Z')

         await LinkedInProfileService.list('u1', {
            search: 'ada',
            status: 'REPLIED',
            tags: ['vip', 'fintech'],
            tagMatch: 'all',
            addedSince,
            includeArchived: true,
            page: 1,
            pageSize: 10,
         })

         const { where } = mocks.findMany.mock.calls[0][0] as { where: Record<string, unknown> }

         expect(where).toEqual({
            userId: 'u1',
            status: 'REPLIED',
            tags: { hasEvery: ['vip', 'fintech'] },
            createdAt: { gte: addedSince },
            OR: expect.arrayContaining([
               {
                  fullName: {
                     contains: 'ada',
                     mode: 'insensitive',
                  },
               },
               {
                  slug: {
                     contains: 'ada',
                     mode: 'insensitive',
                  },
               },
            ]),
         })
      })
   })

   describe('getForUser', () => {
      it('should look the profile up by id and owner', async () => {
         mocks.findFirst.mockResolvedValueOnce({ id: 'p1' })

         await expect(LinkedInProfileService.getForUser('u1', 'p1')).resolves.toEqual({ id: 'p1' })
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
      it('should update only when the profile belongs to the user', async () => {
         mocks.update.mockResolvedValueOnce({ id: 'p1' })

         await LinkedInProfileService.updateForUser('u1', 'p1', {
            notes: null,
            status: 'CONTACTED',
         })

         expect(mocks.update).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  userId: 'u1',
               },
               data: {
                  notes: null,
                  status: 'CONTACTED',
               },
            })
         )
      })

      it('should return null when the profile is missing or not the user', async () => {
         mocks.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }))

         await expect(LinkedInProfileService.updateForUser('u2', 'p1', { notes: 'x' })).resolves.toBeNull()
      })

      it('should not hide other database errors', async () => {
         mocks.update.mockRejectedValueOnce(new Error('connection lost'))

         await expect(LinkedInProfileService.updateForUser('u1', 'p1', { notes: 'x' })).rejects.toThrow(
            'connection lost'
         )
      })
   })

   describe('archive and restore', () => {
      it('should stamp archivedAt when archiving', async () => {
         mocks.update.mockResolvedValueOnce({ id: 'p1' })

         await LinkedInProfileService.archiveForUser('u1', 'p1')

         const { data, where } = mocks.update.mock.calls[0][0] as {
            data: { archivedAt: Date }
            where: unknown
         }

         expect(where).toEqual({
            id: 'p1',
            userId: 'u1',
         })
         expect(data.archivedAt).toBeInstanceOf(Date)
      })

      it('should clear archivedAt when restoring', async () => {
         mocks.update.mockResolvedValueOnce({ id: 'p1' })

         await LinkedInProfileService.restoreForUser('u1', 'p1')

         expect(mocks.update).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  userId: 'u1',
               },
               data: { archivedAt: null },
            })
         )
      })

      it('should return null for a profile that is not the users', async () => {
         mocks.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }))

         await expect(LinkedInProfileService.archiveForUser('u2', 'p1')).resolves.toBeNull()
      })
   })
})
