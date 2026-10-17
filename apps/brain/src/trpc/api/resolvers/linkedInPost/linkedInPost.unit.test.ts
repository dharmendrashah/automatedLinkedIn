import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { linkedInPost } from './linkedInPost'

const mocks = vi.hoisted(() => ({
   addMany: vi.fn(),
   list: vi.fn(),
   getForUser: vi.fn(),
   setStatus: vi.fn(),
   archiveForUser: vi.fn(),
   restoreForUser: vi.fn(),
}))

vi.mock('database', () => ({
   LinkedInPostService: {
      addMany: mocks.addMany,
      list: mocks.list,
      getForUser: mocks.getForUser,
      setStatus: mocks.setStatus,
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

const caller = (ctx: Partial<Context>) => router({ linkedInPost }).createCaller(ctx as Context).linkedInPost

const POST_ID = '7123456789012345678'

describe('linkedInPost resolvers', () => {
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
      it('should save the post links in both forms for the user and report everything else', async () => {
         mocks.addMany.mockResolvedValueOnce({
            created: 1,
            restored: 0,
            skipped: 0,
         })

         const urls = `linkedin.com/posts/ada_x-activity-${POST_ID}-AbCd?utm_source=share linkedin.com/in/ada-lovelace`
         const result = await caller(authed()).create({ urls })

         expect(mocks.addMany).toHaveBeenCalledWith('u1', [
            {
               slug: `activity-${POST_ID}`,
               url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}`,
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
         const urls = Array.from(
            { length: 201 },
            (_, index) => `linkedin.com/feed/update/urn:li:activity:7${String(index).padStart(18, '0')}`
         ).join('\n')

         await expect(caller(authed()).create({ urls: '  ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(caller(authed()).create({ urls })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
            message: 'Paste at most 200 links at once.',
         })
         expect(mocks.addMany).not.toHaveBeenCalled()
      })
   })

   describe('list', () => {
      it('should page for the current user with defaults and accept the post statuses', async () => {
         mocks.list.mockResolvedValue({
            items: [],
            total: 0,
         })

         await caller(authed()).list({
            search: ' 7123 ',
            status: 'PROCESSED',
         })

         expect(mocks.list).toHaveBeenCalledWith('u1', {
            search: '7123',
            status: 'PROCESSED',
            page: 1,
            pageSize: 25,
         })
         const wrongStatus = { status: 'CONTACTED' as never }

         await expect(caller(authed()).list(wrongStatus)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
   })

   describe('get, archive and restore', () => {
      it('should answer NOT_FOUND for a missing or foreign post', async () => {
         mocks.getForUser.mockResolvedValueOnce(null)
         mocks.archiveForUser.mockResolvedValueOnce(null)
         mocks.restoreForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).get({ id: 'p9' })).rejects.toMatchObject({
            code: 'NOT_FOUND',
            message: 'LinkedIn post not found',
         })
         await expect(caller(authed()).archive({ id: 'p9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
         await expect(caller(authed()).restore({ id: 'p9' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should scope every call to the current user', async () => {
         mocks.getForUser.mockResolvedValueOnce({ id: 'p1' })
         mocks.archiveForUser.mockResolvedValueOnce({ id: 'p1' })
         mocks.restoreForUser.mockResolvedValueOnce({ id: 'p1' })

         await caller(authed()).get({ id: 'p1' })
         await caller(authed()).archive({ id: 'p1' })
         await caller(authed()).restore({ id: 'p1' })

         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 'p1')
         expect(mocks.archiveForUser).toHaveBeenCalledWith('u1', 'p1')
         expect(mocks.restoreForUser).toHaveBeenCalledWith('u1', 'p1')
      })
   })

   describe('update', () => {
      it('should set the status for the current user', async () => {
         mocks.setStatus.mockResolvedValueOnce({ id: 'p1' })

         await caller(authed()).update({
            id: 'p1',
            status: 'PROCESSED',
         })

         expect(mocks.setStatus).toHaveBeenCalledWith('u1', 'p1', 'PROCESSED')
      })

      it('should answer NOT_FOUND for a foreign post and reject an unknown status', async () => {
         mocks.setStatus.mockResolvedValueOnce(null)

         await expect(
            caller(authed()).update({
               id: 'p9',
               status: 'UNPROCESSED',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
         await expect(
            caller(authed()).update({
               id: 'p1',
               status: 'NEW' as never,
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
   })
})
