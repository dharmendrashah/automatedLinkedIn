import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AccountRoomService, roomLeft } from './accountRoom.service'
import { limitOf } from './limits'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const db = PrismaService.client
const NOW = new Date()

let userId: string
let accountId: string

const invite = (slug: string, state: 'SENT' | 'QUEUED' | 'ACCEPTED', startedAt: Date | null) => ({
   userId,
   accountId,
   slug,
   name: slug,
   state,
   plannedAt: NOW,
   startedAt,
})

describe('AccountRoomService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
            },
         })
      ).id
      await db.linkedInInvite.createMany({
         data: [
            invite('today-1', 'SENT', new Date(NOW.getTime() - 60 * 60 * 1000)),
            invite('today-2', 'ACCEPTED', new Date(NOW.getTime() - 2 * 60 * 60 * 1000)),
            invite('three-days', 'SENT', new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000)),
            invite('old-pending', 'SENT', new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)),
            invite('waiting', 'QUEUED', null),
         ],
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: userId } })
   })

   it("should count the day's and the week's invites, and every pending invite of any age", async () => {
      const [room] = await AccountRoomService.forUser(userId, NOW)

      expect(room).toMatchObject({
         accountId,
         invites: {
            limit: limitOf('invitesPerDay', accountId, NOW, 'UTC'),
            used: 2,
         },
         invitesWeek: {
            limit: limitOf('invitesPerWeek', accountId, NOW, 'UTC'),
            used: 3,
         },
         firstMessages: { used: 0 },
         reactions: { used: 0 },
         comments: { used: 0 },
         pending: {
            count: 3,
            level: 'ok',
         },
      })
      expect(
         roomLeft(
            room?.invites ?? {
               limit: 0,
               used: 0,
            }
         )
      ).toBe(limitOf('invitesPerDay', accountId, NOW, 'UTC') - 2)
   })

   it('should have no entry for an account that does not exist, and never go below zero room', async () => {
      expect((await AccountRoomService.forAccounts(['00000000-0000-0000-0000-000000000000'], NOW)).size).toBe(0)
      expect(
         roomLeft({
            limit: 3,
            used: 9,
         })
      ).toBe(0)
   })
})
