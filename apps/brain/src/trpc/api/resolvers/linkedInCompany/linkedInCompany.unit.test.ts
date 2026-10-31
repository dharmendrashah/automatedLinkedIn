import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { linkedInCompany } from './linkedInCompany'

const mocks = vi.hoisted(() => ({
   importMany: vi.fn(),
   readMany: vi.fn(),
   list: vi.fn(),
   getForUser: vi.fn(),
   updateForUser: vi.fn(),
   archiveForUser: vi.fn(),
   restoreForUser: vi.fn(),
   getIcp: vi.fn(),
}))

vi.mock('database', async () => ({
   ...(await vi.importActual<object>('../../../../database/companyFilters')),
   ConflictError: class extends Error {},
   TaskRefusedError: class extends Error {},
   IcpService: { getForUser: mocks.getIcp },
   IMPORT_BATCH: 200,
   IMPORT_CAP: 1_000,
   CompanyPageService: { readMany: mocks.readMany },
   LinkedInCompanyService: {
      importMany: mocks.importMany,
      list: mocks.list,
      getForUser: mocks.getForUser,
      updateForUser: mocks.updateForUser,
      archiveForUser: mocks.archiveForUser,
      restoreForUser: mocks.restoreForUser,
   },
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const user = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const authed = (): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: user as never,
})

const caller = (ctx: Partial<Context>) => router({ linkedInCompany }).createCaller(ctx as Context).linkedInCompany

describe('linkedInCompany resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).list({})
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   describe('import', () => {
      const saved = {
         created: 1,
         restored: 1,
         skipped: 1,
         invalid: 0,
         full: 0,
         slugs: ['new', 'gone', 'live'],
         fresh: ['new', 'gone'],
      }
      const reads = {
         reading: 2,
         readRecently: 0,
         paused: 0,
      }

      it('should read only the new and restored companies when asked for new ones', async () => {
         mocks.importMany.mockResolvedValueOnce(saved)
         mocks.readMany.mockResolvedValueOnce(reads)

         const companies = [
            {
               url: 'linkedin.com/company/new',
               labels: [' SaaS '],
            },
         ]
         const result = await caller(authed()).import({
            companies,
            labels: ['Tier1'],
            read: 'NEW',
         })

         expect(mocks.importMany).toHaveBeenCalledWith(
            'u1',
            [
               {
                  url: 'linkedin.com/company/new',
                  labels: ['saas'],
               },
            ],
            ['tier1']
         )
         expect(mocks.readMany).toHaveBeenCalledWith('u1', { slug: { in: ['new', 'gone'] } })
         expect(result).toEqual({
            created: 1,
            restored: 1,
            skipped: 1,
            invalid: 0,
            full: 0,
            ...reads,
         })
      })

      it('should read every company of the batch for ALL and none by default', async () => {
         mocks.importMany.mockResolvedValue(saved)
         mocks.readMany.mockResolvedValueOnce(reads)

         await caller(authed()).import({
            companies: [{ url: 'x' }],
            read: 'ALL',
         })
         await expect(caller(authed()).import({ companies: [{ url: 'x' }] })).resolves.toMatchObject({ reading: 0 })

         expect(mocks.readMany).toHaveBeenCalledOnce()
         expect(mocks.readMany).toHaveBeenCalledWith('u1', { slug: { in: ['new', 'gone', 'live'] } })
      })

      it('should refuse an empty batch and one over 200 companies', async () => {
         const companies = Array.from({ length: 201 }, (_, index) => ({ url: `linkedin.com/company/firm-${index}` }))

         await expect(caller(authed()).import({ companies: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(caller(authed()).import({ companies })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         expect(mocks.importMany).not.toHaveBeenCalled()
      })
   })

   describe('readMany', () => {
      it('should read only the picked companies of the user, up to 200', async () => {
         mocks.readMany.mockResolvedValueOnce({
            reading: 1,
            readRecently: 0,
            paused: 0,
         })

         await caller(authed()).readMany({ ids: ['c1'] })

         expect(mocks.readMany).toHaveBeenCalledWith('u1', { id: { in: ['c1'] } })
         await expect(
            caller(authed()).readMany({ ids: Array.from({ length: 201 }, (_, index) => `c${index}`) })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
   })

   describe('list', () => {
      it('should page for the current user with defaults', async () => {
         mocks.list.mockResolvedValueOnce({
            items: [],
            total: 0,
         })

         await caller(authed()).list({ search: ' acme ' })

         expect(mocks.list).toHaveBeenCalledWith('u1', {
            search: 'acme',
            page: 1,
            pageSize: 25,
         })
      })

      it('should match only the owner\u2019s ICP and say which page comes next', async () => {
         const rules = {
            industries: ['Maritime'],
            companySizes: [],
            locations: [],
            problemKeywords: [],
         }

         mocks.getIcp.mockResolvedValueOnce(rules).mockResolvedValueOnce(null)
         mocks.list.mockResolvedValueOnce({
            items: [],
            total: 120,
         })

         await expect(
            caller(authed()).list({
               icpId: 'icp-1',
               cursor: 2,
               pageSize: 50,
            })
         ).resolves.toMatchObject({ nextCursor: 3 })
         expect(mocks.getIcp).toHaveBeenCalledWith('u1', 'icp-1')
         expect(mocks.list).toHaveBeenCalledWith('u1', {
            page: 2,
            pageSize: 50,
            icp: {
               rules,
               includeUnread: false,
            },
         })
         await expect(caller(authed()).list({ icpId: 'someone-else' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   describe('get, archive and restore', () => {
      it('should answer NOT_FOUND for a missing or foreign company', async () => {
         mocks.getForUser.mockResolvedValueOnce(null)
         mocks.archiveForUser.mockResolvedValueOnce(null)
         mocks.restoreForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).get({ id: 'c9' })).rejects.toMatchObject({
            code: 'NOT_FOUND',
            message: 'LinkedIn company not found',
         })
         await expect(caller(authed()).archive({ id: 'c9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
         await expect(caller(authed()).restore({ id: 'c9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should scope every call to the current user', async () => {
         mocks.getForUser.mockResolvedValueOnce({ id: 'c1' })
         mocks.archiveForUser.mockResolvedValueOnce({ id: 'c1' })
         mocks.restoreForUser.mockResolvedValueOnce({ id: 'c1' })

         await caller(authed()).get({ id: 'c1' })
         await caller(authed()).archive({ id: 'c1' })
         await caller(authed()).restore({ id: 'c1' })

         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 'c1')
         expect(mocks.archiveForUser).toHaveBeenCalledWith('u1', 'c1')
         expect(mocks.restoreForUser).toHaveBeenCalledWith('u1', 'c1')
      })
   })

   describe('update', () => {
      it('should clean the tags, clear an emptied field and keep a valid website', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'c1' })

         await caller(authed()).update({
            id: 'c1',
            industry: '  ',
            website: ' https://elitale.com ',
            status: 'REPLIED',
            tags: [' Partner ', 'partner'],
         })

         expect(mocks.updateForUser).toHaveBeenCalledWith('u1', 'c1', {
            industry: null,
            website: 'https://elitale.com',
            status: 'REPLIED',
            tags: ['partner'],
         })
      })

      it('should clear the website when it is emptied', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'c1' })

         await caller(authed()).update({
            id: 'c1',
            website: '',
         })

         expect(mocks.updateForUser).toHaveBeenCalledWith('u1', 'c1', { website: null })
      })

      it.each(['javascript:alert(1)', 'elitale.com', 'ftp://elitale.com', 'https://'])(
         'should reject the website %s',
         async website => {
            await expect(
               caller(authed()).update({
                  id: 'c1',
                  website,
               })
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
            expect(mocks.updateForUser).not.toHaveBeenCalled()
         }
      )

      it('should answer NOT_FOUND for a missing or foreign company', async () => {
         mocks.updateForUser.mockResolvedValueOnce(null)

         await expect(
            caller(authed()).update({
               id: 'c9',
               notes: 'x',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })
})
