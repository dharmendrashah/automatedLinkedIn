import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProxyServerOwnershipError, ProxyServerService, toProxyConfig } from './proxyServer.service'

const mocks = vi.hoisted(() => ({
   findFirstAccount: vi.fn(),
   findManyProxy: vi.fn(),
   findFirstProxy: vi.fn(),
   countProxy: vi.fn(),
   createProxy: vi.fn(),
   updateProxy: vi.fn(),
   deleteManyProxy: vi.fn(),
   createTest: vi.fn(),
   deleteManyTest: vi.fn(),
   findManyTest: vi.fn(),
   findFirstTest: vi.fn(),
   seal: vi.fn(),
   open: vi.fn(),
   lookupThroughProxy: vi.fn(),
   IpInfoError: class IpInfoError extends Error {},
}))

vi.mock('core', () => ({
   CryptoService: {
      seal: mocks.seal,
      open: mocks.open,
   },
   IpInfoError: mocks.IpInfoError,
   IpInfoService: { lookupThroughProxy: mocks.lookupThroughProxy },
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findFirst: mocks.findFirstAccount },
         proxyServer: {
            findMany: mocks.findManyProxy,
            findFirst: mocks.findFirstProxy,
            count: mocks.countProxy,
            create: mocks.createProxy,
            update: mocks.updateProxy,
            deleteMany: mocks.deleteManyProxy,
         },
         proxyTest: {
            create: mocks.createTest,
            deleteMany: mocks.deleteManyTest,
            findMany: mocks.findManyTest,
            findFirst: mocks.findFirstTest,
         },
      },
   },
}))

const sealed = {
   ciphertext: 'ct',
   iv: 'iv',
   tag: 'tag',
}

const input = {
   linkedInAccountId: 'acc1',
   protocol: 'SOCKS5' as const,
   host: 'proxy.example.net',
   port: 1080,
   username: 'alice',
   password: 'hunter2',
}

const storedRow = {
   id: 'p1',
   linkedInAccountId: 'acc1',
   protocol: 'SOCKS5',
   host: 'proxy.example.net',
   port: 1080,
   secret: 'ct',
   secretIv: 'iv',
   secretTag: 'tag',
   keyVersion: 1,
   status: 'ACTIVE',
   statusMessage: 'Reachable, detected in Canada',
   lastTestedAt: new Date(),
   detectedCountryCode: 'CA',
   detectedCountry: 'Canada',
   detectedIp: '203.0.113.9',
   isPrimary: true,
   createdAt: new Date(),
   updatedAt: new Date(),
}

describe('toProxyConfig', () => {
   it('should build a Playwright-shaped proxy with credentials as separate fields', () => {
      expect(toProxyConfig(input)).toEqual({
         server: 'socks5://proxy.example.net:1080',
         username: 'alice',
         password: 'hunter2',
      })
   })

   it('should omit username and password when neither is set', () => {
      expect(
         toProxyConfig({
            ...input,
            username: undefined,
            password: undefined,
         })
      ).toEqual({ server: 'socks5://proxy.example.net:1080' })
   })
})

describe('ProxyServerService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.createTest.mockResolvedValue({})
      mocks.deleteManyTest.mockResolvedValue({ count: 0 })
      mocks.seal.mockReturnValue(sealed)
      mocks.open.mockReturnValue(
         JSON.stringify({
            username: 'alice',
            password: 'hunter2',
         })
      )
   })

   describe('create', () => {
      it('should refuse a LinkedIn account the user does not own', async () => {
         mocks.findFirstAccount.mockResolvedValue(null)

         await expect(ProxyServerService.create('u1', input)).rejects.toBeInstanceOf(ProxyServerOwnershipError)
         expect(mocks.lookupThroughProxy).not.toHaveBeenCalled()
      })

      it('should mark the first working proxy for an account as ACTIVE and primary', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         const [[{ data }]] = mocks.createProxy.mock.calls

         expect(data).toMatchObject({
            status: 'ACTIVE',
            detectedCountryCode: 'CA',
            isPrimary: true,
         })
      })

      it('should not make a second proxy for the same account primary, even if it works', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([{ detectedCountryCode: 'CA' }])
         mocks.countProxy.mockResolvedValue(1)
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.10',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         expect(mocks.createProxy.mock.calls[0][0].data.isPrimary).toBe(false)
      })

      it("should flag a proxy in a different country than the account's other proxies, without blocking it", async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([{ detectedCountryCode: 'CA' }])
         mocks.countProxy.mockResolvedValue(1)
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '8.8.8.8',
            countryCode: 'US',
            country: 'United States',
         })
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         const [[{ data }]] = mocks.createProxy.mock.calls

         expect(data.status).toBe('GEO_MISMATCH')
         expect(data.statusMessage).toContain('United States')
      })

      it('should mark an unreachable proxy UNREACHABLE and never primary', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.lookupThroughProxy.mockRejectedValue(
            new mocks.IpInfoError('timed out reaching ipinfo.io through the proxy')
         )
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         const [[{ data }]] = mocks.createProxy.mock.calls

         expect(data).toMatchObject({
            status: 'UNREACHABLE',
            statusMessage: 'timed out reaching ipinfo.io through the proxy',
            isPrimary: false,
         })
         expect(data.detectedCountryCode).toBeUndefined()
      })

      it('should store how long the test took, when the proxy works', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
            latencyMs: 342,
         })
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         expect(mocks.createProxy.mock.calls[0][0].data.latencyMs).toBe(342)
      })

      it('should store no latency for a proxy that cannot be reached', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.lookupThroughProxy.mockRejectedValue(new mocks.IpInfoError('timed out'))
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         expect(mocks.createProxy.mock.calls[0][0].data.latencyMs).toBeUndefined()
      })

      it('should never store the proxy password in plaintext', async () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.createProxy.mockResolvedValue(storedRow)

         await ProxyServerService.create('u1', input)

         expect(JSON.stringify(mocks.createProxy.mock.calls[0][0])).not.toContain('hunter2')
         expect(mocks.seal).toHaveBeenCalledWith(
            JSON.stringify({
               username: 'alice',
               password: 'hunter2',
            })
         )
      })
   })

   describe('update', () => {
      it('should refuse a proxy the user does not own', async () => {
         mocks.findFirstProxy.mockResolvedValue(null)

         await expect(ProxyServerService.update('u1', 'p1', {})).rejects.toBeInstanceOf(ProxyServerOwnershipError)
      })

      it('should clear the password when it is set to null', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.updateProxy.mockResolvedValue(storedRow)

         await ProxyServerService.update('u1', 'p1', { password: null })

         expect(mocks.seal).toHaveBeenCalledWith(JSON.stringify({ username: 'alice' }))
      })

      it('should replace the stored latency with the new measurement on a re-test', async () => {
         mocks.findFirstProxy.mockResolvedValue({
            ...storedRow,
            latencyMs: 900,
         })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
            latencyMs: 210,
         })
         mocks.updateProxy.mockResolvedValue(storedRow)

         await ProxyServerService.update('u1', 'p1', {})

         expect(mocks.updateProxy.mock.calls[0][0].data.latencyMs).toBe(210)
      })

      it('should clear the stored latency when the proxy can no longer be reached', async () => {
         mocks.findFirstProxy.mockResolvedValue({
            ...storedRow,
            latencyMs: 900,
         })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockRejectedValue(new mocks.IpInfoError('timed out'))
         mocks.updateProxy.mockResolvedValue(storedRow)

         await ProxyServerService.update('u1', 'p1', {})

         expect(mocks.updateProxy.mock.calls[0][0].data.latencyMs).toBeNull()
      })

      it("should compare against the account's other proxies, not itself", async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.updateProxy.mockResolvedValue(storedRow)

         await ProxyServerService.update('u1', 'p1', {})

         expect(mocks.findManyProxy.mock.calls[0][0].where.id).toEqual({ not: 'p1' })
      })
   })

   describe('test', () => {
      it('should re-test with no field changes', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockResolvedValue({
            ip: '203.0.113.9',
            countryCode: 'CA',
            country: 'Canada',
         })
         mocks.updateProxy.mockResolvedValue(storedRow)

         await ProxyServerService.test('u1', 'p1')

         expect(mocks.updateProxy.mock.calls[0][0].data).toMatchObject({
            protocol: storedRow.protocol,
            host: storedRow.host,
            port: storedRow.port,
         })
      })
   })

   describe('remove', () => {
      it('should only delete a proxy scoped to the owner', async () => {
         mocks.deleteManyProxy.mockResolvedValue({ count: 1 })

         await expect(ProxyServerService.remove('u1', 'p1')).resolves.toBe(true)
         expect(mocks.deleteManyProxy.mock.calls[0][0].where).toEqual({
            id: 'p1',
            linkedInAccount: { userId: 'u1' },
         })
      })

      it('should resolve false when nothing was deleted', async () => {
         mocks.deleteManyProxy.mockResolvedValue({ count: 0 })

         await expect(ProxyServerService.remove('u1', 'p1')).resolves.toBe(false)
      })
   })

   describe('listUsableForAccount', () => {
      it("should list the account's working proxies for its owner, without credentials", async () => {
         mocks.findManyProxy.mockResolvedValue([storedRow])

         await ProxyServerService.listUsableForAccount('u1', 'acc1')

         const [[args]] = mocks.findManyProxy.mock.calls

         expect(args.where).toEqual({
            linkedInAccountId: 'acc1',
            linkedInAccount: { userId: 'u1' },
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         })
         expect(args.select).not.toHaveProperty('secret')
         expect(args.select).toMatchObject({
            id: true,
            host: true,
            latencyMs: true,
         })
      })
   })

   describe('pickForAccount', () => {
      it('should return null when the account has no working proxy', async () => {
         mocks.findFirstProxy.mockResolvedValue(null)

         await expect(ProxyServerService.pickForAccount('acc1')).resolves.toBeNull()
      })

      it('should prefer the primary proxy, then the most recently tested one', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)

         await ProxyServerService.pickForAccount('acc1')

         expect(mocks.findFirstProxy.mock.calls[0][0]).toMatchObject({
            where: {
               linkedInAccountId: 'acc1',
               status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
            },
            orderBy: [{ isPrimary: 'desc' }, { lastTestedAt: 'desc' }],
         })
      })

      it('should return the Playwright-shaped proxy with decrypted credentials, and a summary without them', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)

         await expect(ProxyServerService.pickForAccount('acc1')).resolves.toEqual({
            config: {
               server: 'socks5://proxy.example.net:1080',
               username: 'alice',
               password: 'hunter2',
            },
            summary: {
               id: 'p1',
               protocol: 'SOCKS5',
               host: 'proxy.example.net',
               port: 1080,
               country: 'Canada',
            },
         })
      })

      it('should pick the proxy that was asked for, if it is one of the account usable proxies', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)

         await ProxyServerService.pickForAccount('acc1', 'p1')

         expect(mocks.findFirstProxy.mock.calls[0][0].where).toEqual({
            id: 'p1',
            linkedInAccountId: 'acc1',
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         })
      })

      it('should return null for a proxy that is not the account usable, so another account proxy cannot be used', async () => {
         mocks.findFirstProxy.mockResolvedValue(null)

         await expect(ProxyServerService.pickForAccount('acc1', 'someone-elses')).resolves.toBeNull()
      })
   })

   describe('test history', () => {
      const DAY_MS = 24 * 60 * 60 * 1000
      const exchange = {
         request: {
            method: 'GET' as const,
            url: 'https://api.ipinfo.io/lite/me',
            headers: {
               host: 'api.ipinfo.io',
               authorization: 'Bearer ***',
            },
            body: null,
         },
         response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: '{"ip":"203.0.113.9","country_code":"CA","country":"Canada"}',
            truncated: false,
         },
         elapsedMs: 342,
      }
      const good = {
         ip: '203.0.113.9',
         countryCode: 'CA',
         country: 'Canada',
         latencyMs: 342,
         exchange,
      }
      const saved = () => mocks.createTest.mock.calls[0][0].data

      const arrangeCreate = () => {
         mocks.findFirstAccount.mockResolvedValue({ id: 'acc1' })
         mocks.findManyProxy.mockResolvedValue([])
         mocks.countProxy.mockResolvedValue(0)
         mocks.createProxy.mockResolvedValue(storedRow)
      }

      it('should save what was sent and what came back when a proxy is added', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockResolvedValue(good)

         await ProxyServerService.create('u1', input)

         expect(mocks.createTest).toHaveBeenCalledTimes(1)
         expect(saved()).toEqual({
            proxyServerId: 'p1',
            status: 'ACTIVE',
            statusMessage: 'Reachable, detected in Canada',
            latencyMs: 342,
            requestMethod: 'GET',
            requestUrl: 'https://api.ipinfo.io/lite/me',
            requestHeaders: {
               host: 'api.ipinfo.io',
               authorization: 'Bearer ***',
            },
            requestBody: null,
            responseStatus: 200,
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: exchange.response.body,
            responseTruncated: false,
            error: null,
         })
      })

      it('should save a test that got an answer but no success, with the answer', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockRejectedValue(
            Object.assign(new mocks.IpInfoError('ipinfo.io responded with HTTP 403'), {
               exchange: {
                  ...exchange,
                  response: {
                     status: 403,
                     headers: {},
                     body: '{"error":"bad token"}',
                     truncated: false,
                  },
                  elapsedMs: 120,
               },
            })
         )

         await ProxyServerService.create('u1', input)

         expect(saved()).toMatchObject({
            status: 'UNREACHABLE',
            latencyMs: 120,
            responseStatus: 403,
            responseBody: '{"error":"bad token"}',
            error: 'ipinfo.io responded with HTTP 403',
         })
      })

      it('should save a test with no response when the proxy could not be reached', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockRejectedValue(
            Object.assign(new mocks.IpInfoError('could not reach ipinfo.io through the proxy: ECONNREFUSED'), {
               exchange: {
                  ...exchange,
                  response: null,
                  elapsedMs: 15,
               },
            })
         )

         await ProxyServerService.create('u1', input)

         expect(saved()).toMatchObject({
            responseStatus: null,
            responseBody: null,
            error: 'could not reach ipinfo.io through the proxy: ECONNREFUSED',
         })
         expect(saved().responseHeaders).toBeUndefined()
      })

      it('should still save a test when the failure carries no exchange at all', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockRejectedValue(new Error('boom'))

         await ProxyServerService.create('u1', input)

         expect(saved()).toMatchObject({
            status: 'UNREACHABLE',
            requestMethod: 'GET',
            responseStatus: null,
            error: 'could not reach the proxy',
         })
      })

      it.each([
         ['an edit', () => ProxyServerService.update('u1', 'p1', {})],
         ['Test now', () => ProxyServerService.test('u1', 'p1')],
      ])('should save a test for %s too', async (_name, run) => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)
         mocks.findManyProxy.mockResolvedValue([])
         mocks.lookupThroughProxy.mockResolvedValue(good)
         mocks.updateProxy.mockResolvedValue(storedRow)

         await run()

         expect(mocks.createTest).toHaveBeenCalledTimes(1)
         expect(saved().proxyServerId).toBe('p1')
      })

      it('should delete tests older than 7 days every time one is saved', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockResolvedValue(good)

         await ProxyServerService.create('u1', input)

         const [[{ where }]] = mocks.deleteManyTest.mock.calls
         const cutoff: Date = where.testedAt.lt

         expect(Math.abs(Date.now() - DAY_MS * 7 - cutoff.getTime())).toBeLessThan(5000)
      })

      it('should never store the proxy credentials or the token', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockResolvedValue(good)

         await ProxyServerService.create('u1', input)

         const text = JSON.stringify(mocks.createTest.mock.calls)

         expect(text).not.toContain('hunter2')
         expect(text).not.toContain('alice')
         expect(text).not.toContain('test-ipinfo-token')
      })

      it('should still return the proxy, and not log secrets, when the history cannot be saved', async () => {
         arrangeCreate()
         mocks.lookupThroughProxy.mockResolvedValue(good)
         mocks.createTest.mockRejectedValue(new Error('connection lost'))

         await expect(ProxyServerService.create('u1', input)).resolves.toMatchObject({ id: 'p1' })
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('connection lost'))
         expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('hunter2')
      })

      describe('history', () => {
         it('should refuse a proxy the user does not own', async () => {
            mocks.findFirstProxy.mockResolvedValue(null)

            await expect(ProxyServerService.history('u1', 'p1')).rejects.toBeInstanceOf(ProxyServerOwnershipError)
            expect(mocks.findFirstProxy.mock.calls[0][0].where).toEqual({
               id: 'p1',
               linkedInAccount: { userId: 'u1' },
            })
         })

         it('should list the last 7 days newest first, without the heavy request and response data', async () => {
            mocks.findFirstProxy.mockResolvedValue(storedRow)
            mocks.findManyTest.mockResolvedValue([])

            await ProxyServerService.history('u1', 'p1')

            const [[query]] = mocks.findManyTest.mock.calls

            expect(query.where.proxyServerId).toBe('p1')
            expect(Math.abs(Date.now() - DAY_MS * 7 - query.where.testedAt.gte.getTime())).toBeLessThan(5000)
            expect(query.orderBy).toEqual({ testedAt: 'desc' })
            expect(query.select).toEqual({
               id: true,
               testedAt: true,
               status: true,
               statusMessage: true,
               latencyMs: true,
               responseStatus: true,
               error: true,
            })
         })
      })

      describe('historyEntry', () => {
         it('should only return a test of a proxy the user owns, from the last 7 days', async () => {
            mocks.findFirstTest.mockResolvedValue({ id: 't1' })

            await expect(ProxyServerService.historyEntry('u1', 't1')).resolves.toEqual({ id: 't1' })

            const [[{ where }]] = mocks.findFirstTest.mock.calls

            expect(where.id).toBe('t1')
            expect(where.proxyServer).toEqual({ linkedInAccount: { userId: 'u1' } })
            expect(where.testedAt.gte).toBeInstanceOf(Date)
         })

         it('should answer not found for a test that is not the users or is too old', async () => {
            mocks.findFirstTest.mockResolvedValue(null)

            await expect(ProxyServerService.historyEntry('u1', 't1')).rejects.toBeInstanceOf(ProxyServerOwnershipError)
         })
      })
   })
})
