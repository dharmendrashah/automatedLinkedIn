import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { proxyServer } from './proxyServer'

const mocks = vi.hoisted(() => {
   class ProxyServerOwnershipError extends Error {}
   class BrowserTestRefusedError extends Error {}

   return {
      ProxyServerOwnershipError,
      BrowserTestRefusedError,
      requestAutomatic: vi.fn(),
      requestForUser: vi.fn(),
      listForUser: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      test: vi.fn(),
      remove: vi.fn(),
      history: vi.fn(),
      historyEntry: vi.fn(),
      requestIfWaiting: vi.fn(),
   }
})

vi.mock('database', () => ({
   ProxyServerOwnershipError: mocks.ProxyServerOwnershipError,
   BrowserTestRefusedError: mocks.BrowserTestRefusedError,
   BrowserTestService: {
      requestAutomatic: mocks.requestAutomatic,
      requestForUser: mocks.requestForUser,
   },
   ProxyServerService: {
      listForUser: mocks.listForUser,
      create: mocks.create,
      update: mocks.update,
      test: mocks.test,
      remove: mocks.remove,
      history: mocks.history,
      historyEntry: mocks.historyEntry,
   },
   LinkedInAccountValidationService: { requestIfWaiting: mocks.requestIfWaiting },
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

const caller = () => router({ proxyServer }).createCaller(authed() as Context).proxyServer

const proxy = (status: string) => ({
   id: 'p1',
   linkedInAccountId: 'acc1',
   status,
})

const created = {
   linkedInAccountId: 'acc1',
   protocol: 'HTTP' as const,
   host: 'proxy.example.net',
   port: 8080,
}

describe('proxyServer resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   describe.each([
      ['create', () => caller().create(created), mocks.create],
      [
         'update',
         () =>
            caller().update({
               id: 'p1',
               host: 'other.example.net',
            }),
         mocks.update,
      ],
      ['test', () => caller().test({ id: 'p1' }), mocks.test],
   ])('%s', (_name, run, service) => {
      it.each(['ACTIVE', 'GEO_MISMATCH'])(
         'should validate the account that was waiting for a proxy when it is %s',
         async status => {
            service.mockResolvedValue(proxy(status))
            mocks.requestIfWaiting.mockResolvedValue(true)

            await run()

            expect(mocks.requestIfWaiting).toHaveBeenCalledWith('acc1')
         }
      )

      it.each(['UNREACHABLE', 'PENDING', 'DISABLED'])('should not validate anything when it is %s', async status => {
         service.mockResolvedValue(proxy(status))

         await run()

         expect(mocks.requestIfWaiting).not.toHaveBeenCalled()
      })

      it('should still return the proxy when the validation cannot be requested', async () => {
         service.mockResolvedValue(proxy('ACTIVE'))
         mocks.requestIfWaiting.mockRejectedValue(new Error('ECONNREFUSED'))

         await expect(run()).resolves.toMatchObject({ id: 'p1' })
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
      })
   })

   it('should answer not found for a proxy the user does not own', async () => {
      mocks.test.mockRejectedValue(new mocks.ProxyServerOwnershipError('nope'))

      await expect(caller().test({ id: 'p1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(mocks.requestIfWaiting).not.toHaveBeenCalled()
   })

   describe('automatic browser test', () => {
      it.each([
         ['create', () => caller().create(created), mocks.create, false],
         ['test', () => caller().test({ id: 'p1' }), mocks.test, false],
         [
            'update of the address',
            () =>
               caller().update({
                  id: 'p1',
                  host: 'other.example.net',
               }),
            mocks.update,
            true,
         ],
         [
            'update of the password',
            () =>
               caller().update({
                  id: 'p1',
                  password: 'new',
               }),
            mocks.update,
            true,
         ],
         ['update that changes nothing', () => caller().update({ id: 'p1' }), mocks.update, false],
      ])('should ask for a browser test when %s ends with a working proxy', async (_name, run, service, changed) => {
         service.mockResolvedValue(proxy('ACTIVE'))

         await run()

         expect(mocks.requestAutomatic).toHaveBeenCalledWith('p1', { changed })
      })

      it.each(['GEO_MISMATCH', 'UNREACHABLE', 'PENDING'])(
         'should not ask for one when the proxy is %s',
         async status => {
            mocks.test.mockResolvedValue(proxy(status))

            await caller().test({ id: 'p1' })

            expect(mocks.requestAutomatic).not.toHaveBeenCalled()
         }
      )

      it('should not wait for the browser test to finish, so the proxy is returned at once', async () => {
         mocks.test.mockResolvedValue(proxy('ACTIVE'))
         mocks.requestAutomatic.mockReturnValue(new Promise(() => undefined))

         await expect(caller().test({ id: 'p1' })).resolves.toMatchObject({ id: 'p1' })
      })
   })

   describe('browserTest', () => {
      it("should start a browser test of one of the current user's proxies and return the session id", async () => {
         mocks.requestForUser.mockResolvedValue({ id: 's1' })

         await expect(caller().browserTest({ id: 'p1' })).resolves.toEqual({ id: 's1' })
         expect(mocks.requestForUser).toHaveBeenCalledWith('u1', 'p1')
      })

      it('should answer not found for a proxy that is not the users', async () => {
         mocks.requestForUser.mockRejectedValue(new mocks.ProxyServerOwnershipError('nope'))

         await expect(caller().browserTest({ id: 'p1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should say why when the test cannot run now', async () => {
         mocks.requestForUser.mockRejectedValue(
            new mocks.BrowserTestRefusedError('A browser test of this proxy is already running.')
         )

         await expect(caller().browserTest({ id: 'p1' })).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: 'A browser test of this proxy is already running.',
         })
      })
   })

   describe('test history', () => {
      it('should list the history of a proxy for the current user', async () => {
         mocks.history.mockResolvedValue([{ id: 't1' }])

         await expect(caller().history({ id: 'p1' })).resolves.toEqual([{ id: 't1' }])
         expect(mocks.history).toHaveBeenCalledWith('u1', 'p1')
      })

      it('should return one test with its request and response for the current user', async () => {
         mocks.historyEntry.mockResolvedValue({
            id: 't1',
            responseBody: '{}',
         })

         await expect(caller().historyEntry({ id: 't1' })).resolves.toMatchObject({ id: 't1' })
         expect(mocks.historyEntry).toHaveBeenCalledWith('u1', 't1')
      })

      it.each([
         ['history', () => caller().history({ id: 'p1' }), mocks.history],
         ['historyEntry', () => caller().historyEntry({ id: 't1' }), mocks.historyEntry],
      ])('should answer not found for %s that is not the users', async (_name, run, service) => {
         service.mockRejectedValue(new mocks.ProxyServerOwnershipError('nope'))

         await expect(run()).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should not let an anonymous caller read history', async () => {
         const anonymous = router({ proxyServer }).createCaller({
            auth: null,
            user: null,
         } as unknown as Context)

         await expect(anonymous.proxyServer.history({ id: 'p1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
         expect(mocks.history).not.toHaveBeenCalled()
      })
   })
})
