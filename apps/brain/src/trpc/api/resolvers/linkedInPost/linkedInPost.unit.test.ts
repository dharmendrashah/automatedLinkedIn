import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import type * as LinkedInRecord from '../../../../database/linkedInRecord'
import { type Context } from '../../context'
import { linkedInPost } from './linkedInPost'

const mocks = vi.hoisted(() => ({
   addMany: vi.fn(),
   list: vi.fn(),
   getForUser: vi.fn(),
   updateForUser: vi.fn(),
   importMany: vi.fn(),
   readMany: vi.fn(),
}))

vi.mock('database', async () => ({
   IMPORT_BATCH: 200,
   IMPORT_CAP: 1_000,
   POST_SORTS: ['createdAt', 'postedAt', 'comments', 'qualified'],
   importedOf: (await vi.importActual<typeof LinkedInRecord>('../../../../database/linkedInRecord')).importedOf,
   LinkedInPostService: {
      addMany: mocks.addMany,
      list: mocks.list,
      getForUser: mocks.getForUser,
      updateForUser: mocks.updateForUser,
      importMany: mocks.importMany,
   },
   PostPageService: { readMany: mocks.readMany },
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

         expect(mocks.addMany).toHaveBeenCalledWith(
            'u1',
            [
               {
                  slug: `activity-${POST_ID}`,
                  url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}`,
                  expandedUrl: null,
               },
            ],
            []
         )
         expect(result).toEqual({
            created: 1,
            restored: 0,
            skipped: 0,
            invalid: ['linkedin.com/in/ada-lovelace'],
         })
      })

      it('should keep a short link and save the post it redirects to', async () => {
         const target = 'https://www.linkedin.com/posts/ada_x-share-7516986460906954752-Fh8V/'

         vi.stubGlobal(
            'fetch',
            vi.fn(
               async () =>
                  new Response(null, {
                     status: 301,
                     headers: { location: `${target}?rcm=x` },
                  })
            )
         )
         mocks.addMany.mockResolvedValueOnce({
            created: 1,
            restored: 0,
            skipped: 0,
         })

         await caller(authed()).create({ urls: 'https://lnkd.in/p/gtzWY58E' })

         expect(mocks.addMany).toHaveBeenCalledWith(
            'u1',
            [
               {
                  slug: 'lnkd-gtzWY58E',
                  url: 'https://lnkd.in/p/gtzWY58E',
                  expandedUrl: target,
               },
            ],
            []
         )
         vi.unstubAllGlobals()
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

      it('should ask for the cursor page and say whether another follows', async () => {
         mocks.list.mockResolvedValue({
            items: [],
            total: 120,
         })

         await expect(
            caller(authed()).list({
               cursor: 2,
               pageSize: 50,
            })
         ).resolves.toMatchObject({ nextCursor: 3 })
         await expect(
            caller(authed()).list({
               cursor: 3,
               pageSize: 50,
            })
         ).resolves.toMatchObject({ nextCursor: undefined })
         expect(mocks.list).toHaveBeenLastCalledWith('u1', {
            page: 3,
            pageSize: 50,
         })
      })
   })

   describe('import', () => {
      it('should save the posts with their labels and read only the new ones when asked', async () => {
         mocks.importMany.mockResolvedValueOnce({
            created: 1,
            restored: 0,
            skipped: 1,
            full: 0,
            slugs: [`activity-${POST_ID}`, 'activity-7000000000000000001'],
            fresh: [`activity-${POST_ID}`],
         })
         mocks.readMany.mockResolvedValueOnce({
            reading: 1,
            paused: 0,
            readRecently: 0,
         })

         const result = await caller(authed()).import({
            posts: [
               {
                  url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}`,
                  labels: ['SaaS'],
               },
               { url: 'https://www.linkedin.com/in/ada' },
            ],
            read: 'NEW',
         })

         expect(mocks.importMany).toHaveBeenCalledWith(
            'u1',
            [
               expect.objectContaining({
                  slug: `activity-${POST_ID}`,
                  labels: ['saas'],
                  expandedUrl: null,
               }),
            ],
            []
         )
         expect(mocks.readMany).toHaveBeenCalledWith('u1', { slug: { in: [`activity-${POST_ID}`] } })
         expect(result).toEqual({
            created: 1,
            restored: 0,
            skipped: 1,
            full: 0,
            invalid: 1,
            reading: 1,
            paused: 0,
            readRecently: 0,
         })
      })
   })

   describe('get', () => {
      it('should answer NOT_FOUND for a missing or foreign post', async () => {
         mocks.getForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).get({ id: 'p9' })).rejects.toMatchObject({
            code: 'NOT_FOUND',
            message: 'LinkedIn post not found',
         })
         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 'p9')
      })
   })

   describe('update', () => {
      it('should set the status and labels for the current user', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'p1' })

         await caller(authed()).update({
            id: 'p1',
            status: 'PROCESSED',
            tags: ['Acme'],
         })

         expect(mocks.updateForUser).toHaveBeenCalledWith('u1', 'p1', {
            status: 'PROCESSED',
            tags: ['acme'],
         })
      })

      it('should answer NOT_FOUND for a foreign post and reject an unknown status', async () => {
         mocks.updateForUser.mockResolvedValueOnce(null)

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
