import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LinkedInCompanyService } from './linkedInCompany.service'

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
         linkedInCompany: {
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

const company = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/company/${slug}`,
})

describe('LinkedInCompanyService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('addMany', () => {
      it('should create the new companies, restore the archived ones and skip the live ones for the owner', async () => {
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

         const result = await LinkedInCompanyService.addMany('u1', [company('new'), company('live'), company('gone')])

         expect(result).toEqual({
            created: 1,
            restored: 1,
            skipped: 1,
         })
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
                  ...company('new'),
               },
            ],
            skipDuplicates: true,
         })
      })
   })

   describe('list', () => {
      it('should scope to the owner, hide archived rows and search name, industry, website and link', async () => {
         mocks.findMany.mockResolvedValueOnce([{ id: 'c1' }])
         mocks.count.mockResolvedValueOnce(30)

         const result = await LinkedInCompanyService.list('u1', {
            search: 'acme',
            page: 2,
            pageSize: 25,
         })

         const { where, skip, take, orderBy } = mocks.findMany.mock.calls[0][0] as {
            where: { userId: string; archivedAt: null; OR: Record<string, unknown>[] }
            skip: number
            take: number
            orderBy: unknown
         }

         expect(result).toEqual({
            items: [{ id: 'c1' }],
            total: 30,
         })
         expect(where).toMatchObject({
            userId: 'u1',
            archivedAt: null,
         })
         expect(where.OR.map(clause => Object.keys(clause)[0])).toEqual(['name', 'industry', 'website', 'slug'])
         expect([skip, take]).toEqual([25, 25])
         expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
      })
   })

   describe('getForUser', () => {
      it('should look the company up by id and owner', async () => {
         mocks.findFirst.mockResolvedValueOnce({ id: 'c1' })

         await expect(LinkedInCompanyService.getForUser('u1', 'c1')).resolves.toEqual({ id: 'c1' })
         expect(mocks.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'c1',
                  userId: 'u1',
               },
            })
         )
      })
   })

   describe('updateForUser, archiveForUser and restoreForUser', () => {
      it('should change a company only when it belongs to the user', async () => {
         mocks.update.mockResolvedValue({ id: 'c1' })

         await LinkedInCompanyService.updateForUser('u1', 'c1', {
            website: null,
            status: 'CONTACTED',
         })
         await LinkedInCompanyService.restoreForUser('u1', 'c1')
         await LinkedInCompanyService.archiveForUser('u1', 'c1')

         const calls = mocks.update.mock.calls.map(
            ([args]) => args as { where: unknown; data: Record<string, unknown> }
         )

         expect(calls.map(call => call.where)).toEqual(
            Array(3).fill({
               id: 'c1',
               userId: 'u1',
            })
         )
         expect(calls[0].data).toEqual({
            website: null,
            status: 'CONTACTED',
         })
         expect(calls[1].data).toEqual({ archivedAt: null })
         expect(calls[2].data.archivedAt).toBeInstanceOf(Date)
      })

      it('should return null for a company that is missing or not the users', async () => {
         mocks.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }))

         await expect(LinkedInCompanyService.archiveForUser('u2', 'c1')).resolves.toBeNull()
      })
   })
})
