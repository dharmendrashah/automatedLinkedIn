import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { proxyServer } from './proxyServer'

const mocks = vi.hoisted(() => {
   class ProxyServerOwnershipError extends Error {}

   return {
      ProxyServerOwnershipError,
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
