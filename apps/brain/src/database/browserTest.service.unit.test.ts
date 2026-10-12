import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrowserTestRefusedError, BrowserTestService } from './browserTest.service'
import { ProxyServerOwnershipError } from './proxyServer.service'

const mocks = vi.hoisted(() => ({
   findProxy: vi.fn(),
   findSession: vi.fn(),
   pickForAccount: vi.fn(),
   startBrowserTest: vi.fn(),
   fail: vi.fn(),
   publish: vi.fn(),
}))

vi.mock('core', () => ({ StandardTaskQueue: { publish: mocks.publish } }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         proxyServer: { findFirst: mocks.findProxy },
         spiderSession: { findFirst: mocks.findSession },
      },
   },
}))

vi.mock('./proxyServer.service', () => ({
   ProxyServerService: { pickForAccount: mocks.pickForAccount },
   ProxyServerOwnershipError: class extends Error {},
}))

vi.mock('./spiderSession.service', () => ({
   SpiderSessionService: {
      startBrowserTest: mocks.startBrowserTest,
      fail: mocks.fail,
   },
}))

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const proxyRow = (overrides = {}) => ({
   id: 'p1',
   linkedInAccountId: 'acc1',
   status: 'ACTIVE',
   linkedInAccount: { userId: 'u1' },
   ...overrides,
})

const picked = {
   config: {
      server: 'http://proxy.example.net:8080',
      username: 'ada',
      password: 'secret',
   },
   summary: {
      id: 'p1',
      protocol: 'HTTP' as const,
      host: 'proxy.example.net',
      port: 8080,
      country: 'Canada',
   },
}

const ago = (ms: number) => new Date(Date.now() - ms)

describe('BrowserTestService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.findProxy.mockResolvedValue(proxyRow())
      mocks.findSession.mockResolvedValue(null)
      mocks.pickForAccount.mockResolvedValue(picked)
      mocks.startBrowserTest.mockResolvedValue(undefined)
      mocks.fail.mockResolvedValue(undefined)
      mocks.publish.mockResolvedValue(undefined)
   })

   describe('requestForUser', () => {
      it('should note the session, then queue the task through the proxy, and return the session id', async () => {
         const { id } = await BrowserTestService.requestForUser('u1', 'p1')

         expect(mocks.findProxy).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: 'p1',
                  linkedInAccount: { userId: 'u1' },
               },
            })
         )
         expect(mocks.startBrowserTest).toHaveBeenCalledWith({
            id,
            userId: 'u1',
            linkedInAccountId: 'acc1',
            proxy: picked.summary,
            trigger: 'manual',
         })
         expect(mocks.publish).toHaveBeenCalledWith({
            task: 'browser_detection',
            task_id: id,
            proxy: picked.config,
            requested_at: expect.any(String),
         })
         expect(mocks.startBrowserTest.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.publish.mock.invocationCallOrder[0]
         )
      })

      it("should say the proxy is not found for someone else's proxy", async () => {
         mocks.findProxy.mockResolvedValue(null)

         await expect(BrowserTestService.requestForUser('u2', 'p1')).rejects.toBeInstanceOf(ProxyServerOwnershipError)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it.each(['PENDING', 'UNREACHABLE'])('should refuse a proxy that is %s', async status => {
         mocks.findProxy.mockResolvedValue(proxyRow({ status }))

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toBeInstanceOf(BrowserTestRefusedError)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should also test a proxy that works but sits in another country', async () => {
         mocks.findProxy.mockResolvedValue(proxyRow({ status: 'GEO_MISMATCH' }))

         await expect(BrowserTestService.requestForUser('u1', 'p1')).resolves.toEqual({ id: expect.any(String) })
      })

      it('should refuse while a test of this proxy is running', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'IN_PROGRESS',
            startedAt: ago(10 * MINUTE_MS),
         })

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toThrow('already running')
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should not be blocked for ever by a test that never answered', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'IN_PROGRESS',
            startedAt: ago(2 * HOUR_MS),
         })

         await expect(BrowserTestService.requestForUser('u1', 'p1')).resolves.toEqual({ id: expect.any(String) })
      })

      it('should ask for a wait of 5 minutes between two tests of the same proxy, and say how long is left', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'FAILED',
            startedAt: ago(2 * MINUTE_MS),
         })

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toThrow('3 minute')

         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(6 * MINUTE_MS),
         })

         await expect(BrowserTestService.requestForUser('u1', 'p1')).resolves.toEqual({ id: expect.any(String) })
      })

      it('should end the session as failed and refuse when the task cannot be queued', async () => {
         mocks.publish.mockRejectedValue(new Error('nack from broker'))

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toThrow('could not be queued')
         expect(mocks.fail).toHaveBeenCalledWith(mocks.startBrowserTest.mock.calls[0][0].id, expect.any(String))
      })

      it('should not queue anything when the session cannot be saved', async () => {
         mocks.startBrowserTest.mockRejectedValue(new Error('database down'))

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toThrow()
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should refuse when the proxy stopped being usable between the two reads', async () => {
         mocks.pickForAccount.mockResolvedValue(null)

         await expect(BrowserTestService.requestForUser('u1', 'p1')).rejects.toBeInstanceOf(BrowserTestRefusedError)
      })
   })

   describe('requestAutomatic', () => {
      it('should queue a test for a proxy that was never tested', async () => {
         await expect(BrowserTestService.requestAutomatic('p1')).resolves.toBe(true)

         expect(mocks.startBrowserTest).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'automatic' }))
         expect(mocks.findProxy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }))
      })

      it('should skip a proxy that was tested in the last 24 hours', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(23 * HOUR_MS),
         })

         await expect(BrowserTestService.requestAutomatic('p1')).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should test again after 24 hours', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(25 * HOUR_MS),
         })

         await expect(BrowserTestService.requestAutomatic('p1')).resolves.toBe(true)
      })

      it('should test again within 24 hours when the connection was changed, but still keep the 5 minute wait', async () => {
         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(2 * HOUR_MS),
         })

         await expect(BrowserTestService.requestAutomatic('p1', { changed: true })).resolves.toBe(true)

         mocks.findSession.mockResolvedValue({
            status: 'SUCCEEDED',
            startedAt: ago(MINUTE_MS),
         })

         await expect(BrowserTestService.requestAutomatic('p1', { changed: true })).resolves.toBe(false)
      })

      it('should never throw, so a proxy save cannot fail because of it', async () => {
         mocks.findProxy.mockRejectedValue(new Error('database down'))

         await expect(BrowserTestService.requestAutomatic('p1')).resolves.toBe(false)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('database down'))
      })

      it('should skip a proxy that is not working', async () => {
         mocks.findProxy.mockResolvedValue(proxyRow({ status: 'UNREACHABLE' }))

         await expect(BrowserTestService.requestAutomatic('p1')).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
      })
   })
})
