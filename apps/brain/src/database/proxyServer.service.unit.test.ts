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

      it('should return the Playwright-shaped proxy with decrypted credentials', async () => {
         mocks.findFirstProxy.mockResolvedValue(storedRow)

         await expect(ProxyServerService.pickForAccount('acc1')).resolves.toEqual({
            server: 'socks5://proxy.example.net:1080',
            username: 'alice',
            password: 'hunter2',
         })
      })
   })
})
