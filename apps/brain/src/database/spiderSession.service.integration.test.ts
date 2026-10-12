import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'

import { PrismaService } from './prisma.service'
import {
   SpiderRecordingUnavailableError,
   SpiderSessionNotFoundError,
   SpiderSessionService,
} from './spiderSession.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const PREFIX = 'recordings/validate/0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11/20261012T100005Z'

let userId: string
let otherUserId: string
let accountId: string
let proxyId: string

const newAccount = async (ownerId: string, accountEmail: string) => {
   const sealed = CryptoService.seal('{}')

   return PrismaService.client.linkedInAccount.create({
      data: {
         userId: ownerId,
         email: accountEmail,
         secret: sealed.ciphertext,
         secretIv: sealed.iv,
         secretTag: sealed.tag,
      },
   })
}

const start = (id: string, overrides: Partial<Parameters<typeof SpiderSessionService.start>[0]> = {}) =>
   SpiderSessionService.start({
      id,
      userId,
      linkedInAccountId: accountId,
      email: 'ada@work.com',
      proxy: {
         id: proxyId,
         protocol: 'HTTP',
         host: '203.0.113.5',
         port: 8080,
         country: 'Canada',
      },
      ...overrides,
   })

describe('SpiderSessionService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id

      accountId = (await newAccount(userId, 'ada@work.com')).id

      const sealed = CryptoService.seal('{}')

      proxyId = (
         await PrismaService.client.proxyServer.create({
            data: {
               linkedInAccountId: accountId,
               protocol: 'HTTP',
               host: '203.0.113.5',
               port: 8080,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               status: 'ACTIVE',
            },
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should note a session in progress, then give it its verdict once', async () => {
      const id = randomUUID()

      await start(id)

      const before = await PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })

      expect(before).toMatchObject({
         status: 'IN_PROGRESS',
         kind: 'VALIDATE_ACCOUNT',
         proxyHost: '203.0.113.5',
         proxyCountry: 'Canada',
         requestParams: {
            action: 'VALIDATE_ACCOUNT',
            email: 'ada@work.com',
            proxy: 'http://203.0.113.5:8080',
         },
      })

      const result = {
         validation_id: id,
         account_id: accountId,
         outcome: 'VALID' as const,
         message: 'Signed in to LinkedIn.',
         checked_at: new Date(before.startedAt.getTime() + 12_000).toISOString(),
         recording_prefix: PREFIX,
      }

      await expect(SpiderSessionService.finish(result)).resolves.toBe(true)
      await expect(
         SpiderSessionService.finish({
            ...result,
            outcome: 'ERROR',
         })
      ).resolves.toBe(false)

      await expect(PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
         status: 'SUCCEEDED',
         outcome: 'VALID',
         durationMs: 12_000,
         recordingPrefix: PREFIX,
      })
   })

   it('should list and open only the sessions of the user they belong to', async () => {
      const id = randomUUID()

      await start(id)

      const mine = await SpiderSessionService.listForUser(userId, {})
      const theirs = await SpiderSessionService.listForUser(otherUserId, {})

      expect(mine.items.map(item => item.id)).toContain(id)
      expect(theirs.items).toEqual([])
      await expect(SpiderSessionService.getForUser(userId, id)).resolves.toMatchObject({
         id,
         linkedInAccount: { email: 'ada@work.com' },
      })
      await expect(SpiderSessionService.getForUser(otherUserId, id)).rejects.toBeInstanceOf(SpiderSessionNotFoundError)
   })

   it('should page through the sessions, newest first', async () => {
      const ids = Array.from({ length: 22 }, () => randomUUID())

      for (const id of ids) {
         await start(id)
      }

      const first = await SpiderSessionService.listForUser(userId, {})
      const second = await SpiderSessionService.listForUser(userId, { cursor: first.nextCursor })

      expect(first.items).toHaveLength(20)
      expect(first.nextCursor).toBeDefined()
      expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(
         first.items.length + second.items.length
      )
   })

   it('should keep the proxy snapshot when the proxy is deleted, and link a retry to the session it retries', async () => {
      const first = randomUUID()
      const retry = randomUUID()
      const sealed = CryptoService.seal('{}')
      const doomed = await PrismaService.client.proxyServer.create({
         data: {
            linkedInAccountId: accountId,
            protocol: 'SOCKS5',
            host: '198.51.100.7',
            port: 1080,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status: 'ACTIVE',
         },
      })

      await start(first, {
         proxy: {
            id: doomed.id,
            protocol: 'SOCKS5',
            host: '198.51.100.7',
            port: 1080,
            country: null,
         },
      })
      await start(retry, { retryOfId: first })
      await PrismaService.client.proxyServer.delete({ where: { id: doomed.id } })

      await expect(SpiderSessionService.getForUser(userId, first)).resolves.toMatchObject({
         proxyServerId: null,
         proxyHost: '198.51.100.7',
         retries: [{ id: retry }],
      })
   })

   it('should delete sessions older than 30 days when a new one is saved', async () => {
      const old = randomUUID()

      await start(old)
      await PrismaService.client.spiderSession.update({
         where: { id: old },
         data: { startedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      })
      await start(randomUUID())

      await expect(PrismaService.client.spiderSession.findUnique({ where: { id: old } })).resolves.toBeNull()
   })

   it('should only hand out the files of a recording that exists and has not expired', async () => {
      const recorded = randomUUID()
      const bare = randomUUID()

      await start(recorded)
      await start(bare)
      await PrismaService.client.spiderSession.update({
         where: { id: recorded },
         data: { recordingPrefix: PREFIX },
      })

      await expect(SpiderSessionService.fileKey(userId, recorded, 'video.webm')).resolves.toBe(`${PREFIX}/video.webm`)
      await expect(SpiderSessionService.fileKey(userId, bare, 'video.webm')).rejects.toBeInstanceOf(
         SpiderRecordingUnavailableError
      )
      await expect(SpiderSessionService.fileKey(otherUserId, recorded, 'video.webm')).rejects.toBeInstanceOf(
         SpiderSessionNotFoundError
      )
   })
})
