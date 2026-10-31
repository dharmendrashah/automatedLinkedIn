import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { session } from './session'

const mocks = vi.hoisted(() => {
   class SpiderSessionNotFoundError extends Error {}
   class SpiderRecordingUnavailableError extends Error {}
   class LinkedInAccountPausedError extends Error {}
   class LinkedInVerifyCooldownError extends Error {}
   class SessionRetryError extends Error {
      public constructor(
         public code: 'NOT_FOUND' | 'REFUSED',
         message: string
      ) {
         super(message)
      }
   }

   class SpiderSensitiveFileError extends Error {}

   return {
      SpiderSensitiveFileError,
      artifactKey: vi.fn(),
      SpiderSessionNotFoundError,
      SpiderRecordingUnavailableError,
      LinkedInAccountPausedError,
      LinkedInVerifyCooldownError,
      SessionRetryError,
      listForUser: vi.fn(),
      getForUser: vi.fn(),
      fileKey: vi.fn(),
      retryForUser: vi.fn(),
      retryRefusal: vi.fn(),
      listUsableForAccount: vi.fn(),
      configured: vi.fn(),
      urlFor: vi.fn(),
   }
})

vi.mock('database', async () => ({
   ...(await vi.importActual<object>('../../../../database/spiderSessionFilters')),
   SpiderSensitiveFileError: mocks.SpiderSensitiveFileError,
   SpiderSessionNotFoundError: mocks.SpiderSessionNotFoundError,
   SpiderRecordingUnavailableError: mocks.SpiderRecordingUnavailableError,
   LinkedInAccountPausedError: mocks.LinkedInAccountPausedError,
   LinkedInVerifyCooldownError: mocks.LinkedInVerifyCooldownError,
   SessionRetryError: mocks.SessionRetryError,
   retryRefusal: mocks.retryRefusal,
   SpiderSessionService: {
      listForUser: mocks.listForUser,
      getForUser: mocks.getForUser,
      fileKey: mocks.fileKey,
      artifactKey: mocks.artifactKey,
   },
   ProxyServerService: { listUsableForAccount: mocks.listUsableForAccount },
   LinkedInAccountValidationService: { retryForUser: mocks.retryForUser },
}))

vi.mock('core', () => ({
   RecordingLinks: {
      configured: mocks.configured,
      urlFor: mocks.urlFor,
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

const caller = () => router({ session }).createCaller(authed() as Context).session

const stored = {
   id: 's1',
   status: 'FAILED',
   outcome: 'ERROR',
   linkedInAccount: {
      id: 'acc1',
      email: 'ada@work.com',
   },
   proxyServerId: 'p1',
}

describe('session router', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should refuse a caller who is not signed in', async () => {
      const anonymous = router({ session }).createCaller({} as Context)

      await expect(anonymous.session.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   describe('list', () => {
      it("should list only the signed-in user's sessions, with the filters it was given", async () => {
         mocks.listForUser.mockResolvedValue({
            items: [],
            nextCursor: undefined,
         })

         await caller().list({
            accountIds: ['acc1'],
            results: ['FAILED'],
            cursor: 50,
         })

         expect(mocks.listForUser).toHaveBeenCalledWith('u1', {
            accountIds: ['acc1'],
            results: ['FAILED'],
            cursor: 50,
         })
      })

      it('should refuse a result filter it does not know', async () => {
         await expect(caller().list({ results: ['LOST' as never] })).rejects.toThrow()
      })
   })

   describe('get', () => {
      it('should return the session with whether it can be retried, why not, and the proxies to retry through', async () => {
         mocks.getForUser.mockResolvedValue(stored)
         mocks.retryRefusal.mockReturnValue(undefined)
         mocks.configured.mockReturnValue(true)
         mocks.listUsableForAccount.mockResolvedValue([
            {
               id: 'p1',
               protocol: 'HTTP',
               host: 'h',
               port: 1,
               status: 'ACTIVE',
               latencyMs: 120,
               detectedCountry: 'Canada',
               isPrimary: true,
               secret: 'never',
            },
         ])

         const found = await caller().get({ id: 's1' })

         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 's1')
         expect(mocks.listUsableForAccount).toHaveBeenCalledWith('u1', 'acc1')
         expect(found).toMatchObject({
            id: 's1',
            retry: { allowed: true },
            recordingsConfigured: true,
         })
         expect(found.retryProxies).toEqual([
            {
               id: 'p1',
               protocol: 'HTTP',
               host: 'h',
               port: 1,
               status: 'ACTIVE',
               latencyMs: 120,
               detectedCountry: 'Canada',
               isPrimary: true,
            },
         ])
      })

      it('should explain why a session cannot be retried', async () => {
         mocks.getForUser.mockResolvedValue(stored)
         mocks.retryRefusal.mockReturnValue('Wait for this session to finish.')
         mocks.listUsableForAccount.mockResolvedValue([])

         expect((await caller().get({ id: 's1' })).retry).toEqual({
            allowed: false,
            reason: 'Wait for this session to finish.',
         })
      })

      it('should answer not found for a session that is not the users', async () => {
         mocks.getForUser.mockRejectedValue(new mocks.SpiderSessionNotFoundError('Session not found'))

         await expect(caller().get({ id: 's1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   describe('fileUrl', () => {
      it('should give a link to a file of the users own session', async () => {
         mocks.configured.mockReturnValue(true)
         mocks.fileKey.mockResolvedValue('recordings/validate/a/20261012T101500Z/video.webm')
         mocks.urlFor.mockResolvedValue('https://storage.googleapis.com/b/x?sig=1')

         await expect(
            caller().fileUrl({
               id: 's1',
               file: 'video.webm',
            })
         ).resolves.toEqual({ url: 'https://storage.googleapis.com/b/x?sig=1' })
         expect(mocks.fileKey).toHaveBeenCalledWith('u1', 's1', 'video.webm')
         expect(mocks.urlFor).toHaveBeenCalledWith('recordings/validate/a/20261012T101500Z/video.webm')
      })

      it('should answer not found for a session or file that is not available to this user', async () => {
         mocks.configured.mockReturnValue(true)
         mocks.fileKey.mockRejectedValue(new mocks.SpiderSessionNotFoundError('Session not found'))

         await expect(
            caller().fileUrl({
               id: 's1',
               file: '../x',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
         expect(mocks.urlFor).not.toHaveBeenCalled()
      })

      it('should say when there is no recording, or it expired, in a sentence', async () => {
         mocks.configured.mockReturnValue(true)
         mocks.fileKey.mockRejectedValue(
            new mocks.SpiderRecordingUnavailableError('This recording expired after 7 days.')
         )

         await expect(
            caller().fileUrl({
               id: 's1',
               file: 'video.webm',
            })
         ).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: 'This recording expired after 7 days.',
         })
      })

      it('should give a link to a file of a task run by its id, without taking a name from the browser', async () => {
         mocks.configured.mockReturnValue(true)
         mocks.artifactKey.mockResolvedValue('runs/browser-detection/u1/2026/10/13/s1/video.webm')
         mocks.urlFor.mockResolvedValue('https://storage.googleapis.com/b/x?sig=2')

         await expect(
            caller().fileUrl({
               id: 's1',
               artifactId: 'a1',
            })
         ).resolves.toEqual({ url: 'https://storage.googleapis.com/b/x?sig=2' })
         expect(mocks.artifactKey).toHaveBeenCalledWith('u1', 's1', 'a1', false)
         expect(mocks.fileKey).not.toHaveBeenCalled()
      })

      it('should only reveal a file with login tokens when the owner asks for it', async () => {
         mocks.configured.mockReturnValue(true)
         mocks.artifactKey.mockRejectedValue(new mocks.SpiderSensitiveFileError('This file holds login tokens.'))

         await expect(
            caller().fileUrl({
               id: 's1',
               artifactId: 'a1',
            })
         ).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: 'This file holds login tokens.',
         })

         mocks.artifactKey.mockResolvedValue('runs/x/u1/2026/10/13/s1/session.json')
         mocks.urlFor.mockResolvedValue('https://storage.googleapis.com/b/y?sig=3')

         await caller().fileUrl({
            id: 's1',
            artifactId: 'a1',
            reveal: true,
         })

         expect(mocks.artifactKey).toHaveBeenLastCalledWith('u1', 's1', 'a1', true)
      })

      it.each([
         ['neither a name nor an id', { id: 's1' }],
         [
            'both a name and an id',
            {
               id: 's1',
               file: 'video.webm',
               artifactId: 'a1',
            },
         ],
      ])('should refuse %s', async (_name, input) => {
         mocks.configured.mockReturnValue(true)

         await expect(caller().fileUrl(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should say so when recordings are not set up, without touching the database', async () => {
         mocks.configured.mockReturnValue(false)

         await expect(
            caller().fileUrl({
               id: 's1',
               file: 'video.webm',
            })
         ).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: expect.stringContaining('not set up'),
         })
         expect(mocks.fileKey).not.toHaveBeenCalled()
      })
   })

   describe('retry', () => {
      it('should start the session again through the chosen proxy, as the signed-in user', async () => {
         mocks.retryForUser.mockResolvedValue({ id: 'new-session' })

         await expect(
            caller().retry({
               id: 's1',
               proxyId: 'p2',
            })
         ).resolves.toEqual({ id: 'new-session' })
         expect(mocks.retryForUser).toHaveBeenCalledWith('u1', 's1', 'p2')
      })

      it.each([
         ['a session that is not found', new mocks.SessionRetryError('NOT_FOUND', 'Session not found'), 'NOT_FOUND'],
         [
            'a refusal',
            new mocks.SessionRetryError('REFUSED', 'Wait for this session to finish.'),
            'PRECONDITION_FAILED',
         ],
         [
            'a paused account',
            new mocks.LinkedInAccountPausedError('Resume the account before verifying it.'),
            'PRECONDITION_FAILED',
         ],
         [
            'the wait between checks',
            new mocks.LinkedInVerifyCooldownError('Try again in 3 minute(s).'),
            'TOO_MANY_REQUESTS',
         ],
      ])('should turn %s into a clear answer', async (_name, error, code) => {
         mocks.retryForUser.mockRejectedValue(error)

         await expect(
            caller().retry({
               id: 's1',
               proxyId: 'p2',
            })
         ).rejects.toMatchObject({
            code,
            message: error.message,
         })
      })

      it('should let an unexpected failure through as an internal error, without its details', async () => {
         mocks.retryForUser.mockRejectedValue(new Error('connection string postgresql://u:secret@db'))

         await expect(
            caller().retry({
               id: 's1',
               proxyId: 'p2',
            })
         ).rejects.toMatchObject({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Something went wrong. Try again in a moment.',
         })
      })
   })
})
