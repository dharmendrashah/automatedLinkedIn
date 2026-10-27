import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AccountTodayService } from './accountToday.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const NOW = new Date('2026-10-27T12:00:00Z')
const HOUR = 60 * 60 * 1000

let userId: string
let otherUserId: string
let accountId: string
let otherAccountId: string

const account = (ownerId: string, data: Record<string, unknown> = {}) =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: ownerId,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         ...data,
      },
   })

const run = (
   owner: string,
   forAccount: string,
   task: string | null,
   hoursAgo: number,
   data: Record<string, unknown> = {}
) =>
   PrismaService.client.spiderSession.create({
      data: {
         id: randomUUID(),
         userId: owner,
         linkedInAccountId: forAccount,
         kind: task ? 'TASK' : 'VALIDATE_ACCOUNT',
         task,
         status: 'SUCCEEDED',
         requestParams: {},
         startedAt: new Date(NOW.getTime() - hoursAgo * HOUR),
         ...data,
      },
   })

describe('AccountTodayService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await account(userId, { nextBrowseAt: new Date(NOW.getTime() + HOUR) })).id
      otherAccountId = (await account(otherUserId)).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it("should read the newest run and the newest good run of each item, and never another owner's account", async () => {
      await run(userId, accountId, 'linkedin-browse', 30, { verdict: 'VISITED' })
      await run(userId, accountId, 'linkedin-browse', 3, {
         status: 'FAILED',
         verdict: 'ERROR',
      })
      await run(userId, accountId, 'linkedin-messages', 1, { status: 'IN_PROGRESS' })
      await run(otherUserId, otherAccountId, 'linkedin-browse', 1)

      const result = await AccountTodayService.forUser(userId, NOW)

      expect(result.map(({ accountId: id }) => id)).toEqual([accountId])

      const visit = result[0]?.items.find(({ item }) => item === 'visit')
      const messages = result[0]?.items.find(({ item }) => item === 'messages')

      expect(visit).toMatchObject({
         next: new Date(NOW.getTime() + HOUR),
         last: {
            status: 'FAILED',
            verdict: 'ERROR',
            queued: false,
         },
         lastOk: {
            status: 'SUCCEEDED',
            verdict: 'VISITED',
         },
      })
      expect(messages).toMatchObject({
         last: { status: 'IN_PROGRESS' },
         lastOk: null,
      })
   })

   it('should count a login check of the old kind with no task, and leave runs older than 30 days out', async () => {
      await run(userId, accountId, null, 2, { verdict: 'VALID' })
      await run(userId, accountId, 'linkedin-invitations', 31 * 24)

      const items = (await AccountTodayService.forUser(userId, NOW))[0]?.items

      expect(items?.find(({ item }) => item === 'login')?.last).toMatchObject({ verdict: 'VALID' })
      expect(items?.find(({ item }) => item === 'network')?.last).toBeNull()
   })

   it('should answer an empty list for an owner with no account', async () => {
      const lonely = await UserService.create({ email: `${randomUUID()}@elitale.com` })

      await expect(AccountTodayService.forUser(lonely.id, NOW)).resolves.toEqual([])
      await PrismaService.client.user.delete({ where: { id: lonely.id } })
   })
})
