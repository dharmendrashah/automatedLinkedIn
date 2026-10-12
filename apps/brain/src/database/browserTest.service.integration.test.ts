import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { BrowserTestService } from './browserTest.service'
import { PrismaService } from './prisma.service'
import { ProxyServerOwnershipError } from './proxyServer.service'
import { SpiderSessionService } from './spiderSession.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The broker is replaced: only what brain writes to the database is under test.
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock('core', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('core')),
   StandardTaskQueue: { publish: mocks.publish },
}))

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let proxyId: string
let slowProxyId: string

const newProxy = async (linkedInAccountId: string, status: 'ACTIVE' | 'UNREACHABLE' = 'ACTIVE') => {
   const sealed = CryptoService.seal('{}')

   return (
      await PrismaService.client.proxyServer.create({
         data: {
            linkedInAccountId,
            protocol: 'HTTP',
            host: '203.0.113.5',
            port: 8080,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status,
         },
      })
   ).id
}

describe('BrowserTestService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id

      const sealed = CryptoService.seal('{}')
      const account = await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: 'ada@work.com',
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
         },
      })

      proxyId = await newProxy(account.id)
      slowProxyId = await newProxy(account.id)
      mocks.publish.mockResolvedValue(undefined)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should save an in-progress session for the proxy, queue the task, then refuse a second one at once', async () => {
      const { id } = await BrowserTestService.requestForUser(userId, proxyId)

      await expect(PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
         kind: 'BROWSER_TEST',
         status: 'IN_PROGRESS',
         userId,
         proxyServerId: proxyId,
         proxyHost: '203.0.113.5',
         requestParams: {
            action: 'BROWSER_TEST',
            trigger: 'manual',
            proxy: 'http://203.0.113.5:8080',
         },
      })
      expect(mocks.publish).toHaveBeenCalledWith(
         expect.objectContaining({
            task: 'browser_detection',
            task_id: id,
         })
      )

      await expect(BrowserTestService.requestForUser(userId, proxyId)).rejects.toThrow('already running')
   })

   it('should keep the verdict the worker answers, and show it as the session result', async () => {
      const { id } = await BrowserTestService.requestForUser(userId, slowProxyId)

      await SpiderSessionService.finishStandard({
         task: 'browser_detection',
         task_id: id,
         outcome: 'DETECTED',
         message: 'At least one detection page took this browser for a bot.',
         finished_at: new Date().toISOString(),
      })

      await expect(PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
         status: 'FAILED',
         outcome: 'DETECTED',
      })
      // Done, but still inside the 5 minute wait.
      await expect(BrowserTestService.requestForUser(userId, slowProxyId)).rejects.toThrow('minute')
   })

   it("should not test someone else's proxy, and an automatic request for a proxy tested today does nothing", async () => {
      await expect(BrowserTestService.requestForUser(otherUserId, proxyId)).rejects.toBeInstanceOf(
         ProxyServerOwnershipError
      )
      await expect(BrowserTestService.requestAutomatic(proxyId)).resolves.toBe(false)
   })

   it('should refuse a proxy that does not work', async () => {
      const account = await PrismaService.client.linkedInAccount.findFirstOrThrow({ where: { userId } })
      const broken = await newProxy(account.id, 'UNREACHABLE')

      await expect(BrowserTestService.requestForUser(userId, broken)).rejects.toThrow('working proxy')
   })
})
