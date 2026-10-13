import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { linkedInCompany } from './linkedInCompany'

const mocks = vi.hoisted(() => ({
   addMany: vi.fn(),
   list: vi.fn(),
   getForUser: vi.fn(),
   updateForUser: vi.fn(),
   archiveForUser: vi.fn(),
   restoreForUser: vi.fn(),
}))

vi.mock('database', () => ({
   LinkedInCompanyService: {
      addMany: mocks.addMany,
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

   describe('create', () => {
      it('should save the company links for the user and report everything else', async () => {
         mocks.addMany.mockResolvedValueOnce({
            created: 1,
            restored: 0,
            skipped: 0,
         })

         const urls = 'linkedin.com/company/Elitale/jobs linkedin.com/in/ada-lovelace'
         const result = await caller(authed()).create({ urls })

         expect(mocks.addMany).toHaveBeenCalledWith('u1', [
            {
               slug: 'elitale',
               url: 'https://www.linkedin.com/company/elitale',
            },
         ])
         expect(result).toEqual({
            created: 1,
            restored: 0,
            skipped: 0,
            invalid: ['linkedin.com/in/ada-lovelace'],
         })
      })

      it('should reject an empty paste and a paste with too many links', async () => {
         const urls = Array.from({ length: 201 }, (_, index) => `linkedin.com/company/firm-${index}`).join('\n')

         await expect(caller(authed()).create({ urls: '  ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(caller(authed()).create({ urls })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
            message: 'Paste at most 200 links at once.',
         })
         expect(mocks.addMany).not.toHaveBeenCalled()
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
