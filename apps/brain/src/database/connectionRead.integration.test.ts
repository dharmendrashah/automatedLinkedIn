import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ClientService } from './client.service'
import { ConnectionReadService } from './connectionRead.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. What "Get my connections" asks and reads: where an account's read stands, and the people it stored.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const SINCE = new Date('2026-11-02T10:00:00Z')

let userId: string
let accountId: string
let otherAccountId: string

const account = (clientId: string) =>
   db.linkedInAccount.create({
      data: {
         userId,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status: 'ACTIVE',
         clientId,
      },
      select: { id: true },
   })

const session = async (
   forAccount: string,
   status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED',
   startedAt: Date,
   importStatus?: 'PENDING' | 'DONE' | 'FAILED'
) => {
   const id = randomUUID()

   await db.spiderSession.create({
      data: {
         id,
         userId,
         linkedInAccountId: forAccount,
         kind: 'TASK',
         task: 'linkedin-connections',
         status,
         startedAt,
         finishedAt: status === 'IN_PROGRESS' ? null : new Date(startedAt.getTime() + 60_000),
         requestParams: {},
      },
   })

   if (importStatus) {
      await db.connectionImport.create({
         data: {
            sessionId: id,
            status: importStatus,
         },
      })
   }
}

describe('the connections read of an account (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const clientId = (await ClientService.create(userId, 'Acme')).id

      accountId = (await account(clientId)).id
      otherAccountId = (await account(clientId)).id

      for (const [slug, position, connectedOn, forAccount] of [
         ['ana', 0, new Date('2026-10-30T00:00:00Z'), accountId],
         ['ravi', 1, null, accountId],
         ['ana', 0, null, otherAccountId],
         ['zoe', 2, null, otherAccountId],
      ] as const) {
         await db.linkedInConnection.create({
            data: {
               userId,
               accountId: forAccount,
               slug,
               name: slug.toUpperCase(),
               headline: 'Founder',
               position,
               connectedOn,
            },
         })
      }

      await db.linkedInConnection.create({
         data: {
            userId,
            accountId,
            slug: 'gone',
            name: 'GONE',
            headline: '',
            status: 'REMOVED',
         },
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should say running until a read newer than the ask ended and its file was stored', async () => {
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('RUNNING')

      await session(accountId, 'SUCCEEDED', new Date('2026-11-02T09:00:00Z'), 'DONE')
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('RUNNING')

      await session(accountId, 'IN_PROGRESS', new Date('2026-11-02T10:01:00Z'))
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('RUNNING')
   })

   it('should say done once the file is stored, and failed when the run failed or left no file', async () => {
      await session(accountId, 'SUCCEEDED', new Date('2026-11-02T10:05:00Z'), 'PENDING')
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('RUNNING')

      await session(accountId, 'SUCCEEDED', new Date('2026-11-02T10:10:00Z'), 'DONE')
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('DONE')

      await session(accountId, 'FAILED', new Date('2026-11-02T10:20:00Z'))
      expect(await ConnectionReadService.state(accountId, SINCE)).toBe('FAILED')

      await session(otherAccountId, 'SUCCEEDED', new Date('2026-11-02T10:30:00Z'))
      expect(await ConnectionReadService.state(otherAccountId, SINCE)).toBe('FAILED')
   })

   it('should give each person once, the most recent first, only those still connected, up to the limit', async () => {
      expect(await ConnectionReadService.people(userId, [accountId, otherAccountId], 10)).toEqual([
         {
            slug: 'ana',
            url: 'https://www.linkedin.com/in/ana/',
            name: 'ANA',
            headline: 'Founder',
            connectedOn: '2026-10-30',
         },
         expect.objectContaining({ slug: 'ravi' }),
         expect.objectContaining({ slug: 'zoe' }),
      ])
      expect(await ConnectionReadService.people(userId, [accountId], 1)).toHaveLength(1)
      expect(await ConnectionReadService.people(randomUUID(), [accountId], 10)).toEqual([])
   })
})
