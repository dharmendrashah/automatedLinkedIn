import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { linkedInProfile } from './linkedInProfile'

const mocks = vi.hoisted(() => {
   class ProxyServerOwnershipError extends Error {}
   class TaskOwnershipError extends Error {}
   class TaskRefusedError extends Error {}
   class TaskRecentError extends TaskRefusedError {}

   return {
      ProxyServerOwnershipError,
      TaskOwnershipError,
      TaskRefusedError,
      TaskRecentError,
      addMany: vi.fn(),
      list: vi.fn(),
      getForUser: vi.fn(),
      updateForUser: vi.fn(),
      archiveForUser: vi.fn(),
      restoreForUser: vi.fn(),
      requestVisit: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   TaskOwnershipError: mocks.TaskOwnershipError,
   TaskRefusedError: mocks.TaskRefusedError,
   TaskRecentError: mocks.TaskRecentError,
   PageVisitService: { request: mocks.requestVisit },
   LinkedInProfileService: {
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

const caller = (ctx: Partial<Context>) => router({ linkedInProfile }).createCaller(ctx as Context).linkedInProfile

describe('linkedInProfile resolvers', () => {
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
      it('should save the valid links for the user and report the rest', async () => {
         mocks.addMany.mockResolvedValueOnce({
            created: 1,
            restored: 0,
            skipped: 0,
         })

         const result = await caller(authed()).create({
            urls: 'linkedin.com/in/Ada-Lovelace/ https://example.com/x',
            labels: [' Acme ', 'acme'],
         })

         expect(mocks.addMany).toHaveBeenCalledWith(
            'u1',
            [
               {
                  slug: 'ada-lovelace',
                  url: 'https://www.linkedin.com/in/ada-lovelace',
               },
            ],
            ['acme']
         )
         expect(result).toEqual({
            created: 1,
            restored: 0,
            skipped: 0,
            invalid: ['https://example.com/x'],
         })
      })

      it('should reject an empty paste', async () => {
         await expect(caller(authed()).create({ urls: '   ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         expect(mocks.addMany).not.toHaveBeenCalled()
      })

      it('should reject a paste with too many links', async () => {
         const urls = Array.from({ length: 201 }, (_, index) => `linkedin.com/in/person-${index}`).join('\n')

         await expect(caller(authed()).create({ urls })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
            message: 'Paste at most 200 links at once.',
         })
         expect(mocks.addMany).not.toHaveBeenCalled()
      })
   })

   describe('list', () => {
      it('should page for the current user with defaults and a trimmed search', async () => {
         mocks.list.mockResolvedValueOnce({
            items: [],
            total: 0,
         })

         await caller(authed()).list({ search: '  ada ' })

         expect(mocks.list).toHaveBeenCalledWith('u1', {
            search: 'ada',
            page: 1,
            pageSize: 25,
         })
      })

      it('should refuse a page size above the cap', async () => {
         await expect(caller(authed()).list({ pageSize: 101 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
   })

   describe('get', () => {
      it('should return the profile', async () => {
         mocks.getForUser.mockResolvedValueOnce({ id: 'p1' })

         await expect(caller(authed()).get({ id: 'p1' })).resolves.toEqual({ id: 'p1' })
         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 'p1')
      })

      it('should answer NOT_FOUND for a missing or foreign profile', async () => {
         mocks.getForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).get({ id: 'p9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   describe('visit', () => {
      beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))

      it('should ask for a visit of a saved profile or a pasted link, as the owner and with the account named', async () => {
         mocks.requestVisit.mockResolvedValue({ id: 's1' })

         await expect(
            caller(authed()).visit({
               accountId: 'acc1',
               id: 'p1',
            })
         ).resolves.toEqual({ id: 's1' })
         await caller(authed()).visit({
            accountId: 'acc1',
            link: 'linkedin.com/in/ada',
            confirmed: true,
         })

         expect(mocks.requestVisit).toHaveBeenNthCalledWith(1, 'u1', 'acc1', { profileId: 'p1' }, undefined)
         expect(mocks.requestVisit).toHaveBeenNthCalledWith(
            2,
            'u1',
            'acc1',
            {
               kind: 'PROFILE',
               link: 'linkedin.com/in/ada',
            },
            true
         )
      })

      it('should need exactly one of a saved profile and a link', async () => {
         await expect(caller(authed()).visit({ accountId: 'acc1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(
            caller(authed()).visit({
               accountId: 'acc1',
               id: 'p1',
               link: 'linkedin.com/in/ada',
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         expect(mocks.requestVisit).not.toHaveBeenCalled()
      })

      it('should answer NOT_FOUND for a profile or an account that is not the owner’s', async () => {
         mocks.requestVisit.mockResolvedValue(null)

         await expect(
            caller(authed()).visit({
               accountId: 'acc1',
               id: 'p1',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should say a refusal and a recent visit the way every task does', async () => {
         mocks.requestVisit.mockRejectedValueOnce(new mocks.TaskRefusedError('This account reached its limit.'))
         mocks.requestVisit.mockRejectedValueOnce(new mocks.TaskRecentError('Wait 2 minute(s).'))

         await expect(
            caller(authed()).visit({
               accountId: 'acc1',
               id: 'p1',
            })
         ).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: 'This account reached its limit.',
         })
         await expect(
            caller(authed()).visit({
               accountId: 'acc1',
               id: 'p1',
            })
         ).rejects.toMatchObject({ code: 'CONFLICT' })
      })
   })

   describe('update', () => {
      it('should clean the tags and turn empty text into a cleared field', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'p1' })

         await caller(authed()).update({
            id: 'p1',
            company: '  ',
            notes: null,
            status: 'CONTACTED',
            tags: [' VIP ', 'vip', 'Lead'],
         })

         expect(mocks.updateForUser).toHaveBeenCalledWith('u1', 'p1', {
            company: null,
            notes: null,
            status: 'CONTACTED',
            tags: ['vip', 'lead'],
         })
      })

      it('should reject more than 20 labels and a label over 30 characters', async () => {
         const many = Array.from({ length: 21 }, (_, index) => `t${index}`)

         await expect(
            caller(authed()).update({
               id: 'p1',
               tags: many,
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(
            caller(authed()).update({
               id: 'p1',
               tags: ['x'.repeat(31)],
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject an unknown status', async () => {
         await expect(
            caller(authed()).update({
               id: 'p1',
               status: 'HIRED' as never,
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should answer NOT_FOUND for a missing or foreign profile', async () => {
         mocks.updateForUser.mockResolvedValueOnce(null)

         await expect(
            caller(authed()).update({
               id: 'p9',
               notes: 'x',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   describe('archive and restore', () => {
      it('should archive and restore for the current user', async () => {
         mocks.archiveForUser.mockResolvedValueOnce({ id: 'p1' })
         mocks.restoreForUser.mockResolvedValueOnce({ id: 'p1' })

         await caller(authed()).archive({ id: 'p1' })
         await caller(authed()).restore({ id: 'p1' })

         expect(mocks.archiveForUser).toHaveBeenCalledWith('u1', 'p1')
         expect(mocks.restoreForUser).toHaveBeenCalledWith('u1', 'p1')
      })

      it('should answer NOT_FOUND for a missing or foreign profile', async () => {
         mocks.archiveForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).archive({ id: 'p9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })
})
