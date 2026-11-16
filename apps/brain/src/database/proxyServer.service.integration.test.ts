import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { PrismaService } from './prisma.service'
import { ProxyServerService } from './proxyServer.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The one call that would leave the pod (the ipinfo.io lookup through the proxy) is replaced and watched.
const mocks = vi.hoisted(() => ({ lookupThroughProxy: vi.fn() }))

vi.mock('core', async () => {
   const actual = await vi.importActual<{ IpInfoService: object }>('core')

   return {
      ...actual,
      IpInfoService: {
         ...actual.IpInfoService,
         lookupThroughProxy: mocks.lookupThroughProxy,
      },
   }
})

const email = `${randomUUID()}@elitale.com`

let userId: string
let accountId: string

describe('ProxyServerService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: 'ada@work.com',
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
   })

   beforeEach(() => {
      mocks.lookupThroughProxy.mockReset()
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should save a proxy on a private address as UNREACHABLE without connecting to it', async () => {
      const created = await ProxyServerService.create(userId, {
         linkedInAccountId: accountId,
         protocol: 'HTTP',
         host: '169.254.169.254',
         port: 80,
      })

      expect(created.status).toBe('UNREACHABLE')
      expect(created.statusMessage).toBe('This address is not on the public internet, so it cannot be used as a proxy.')
      expect(mocks.lookupThroughProxy).not.toHaveBeenCalled()

      const stored = await PrismaService.client.proxyServer.findUniqueOrThrow({ where: { id: created.id } })

      expect(stored.status).toBe('UNREACHABLE')
      expect(stored.isPrimary).toBe(false)
   })
})
