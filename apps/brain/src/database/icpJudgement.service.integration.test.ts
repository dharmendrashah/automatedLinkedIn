import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IcpJudgementService } from './icpJudgement.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const DAY_MS = 86_400_000
const now = new Date('2026-11-10T12:00:00Z')

let userId: string
let otherUserId: string
let icpId: string
let otherIcpId: string

const icp = (owner: string, name: string) =>
   PrismaService.client.icp.create({
      data: {
         userId: owner,
         name,
         includeTitles: [],
         excludeTitles: [],
         seniorities: [],
         industries: [],
         companySizes: [],
         locations: [],
         problemKeywords: [],
      },
   })

describe('IcpJudgementService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      icpId = (await icp(userId, 'Judged')).id
      otherIcpId = (await icp(userId, 'Other')).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should return a judgement saved for this owner and ideal customer, and nothing else', async () => {
      await IcpJudgementService.save(userId, icpId, 'ana', 70, now)

      expect(await IcpJudgementService.recent(userId, icpId, ['ana', 'bo'], now)).toEqual(new Map([['ana', 70]]))
      expect(await IcpJudgementService.recent(userId, otherIcpId, ['ana'], now)).toEqual(new Map())
      expect(await IcpJudgementService.recent(otherUserId, icpId, ['ana'], now)).toEqual(new Map())
   })

   it('should not reuse a judgement older than 30 days, and refresh it when judged again', async () => {
      await IcpJudgementService.save(userId, icpId, 'old', 50, new Date(now.getTime() - 31 * DAY_MS))

      expect(await IcpJudgementService.recent(userId, icpId, ['old'], now)).toEqual(new Map())

      await IcpJudgementService.save(userId, icpId, 'old', 55, now)

      expect(await IcpJudgementService.recent(userId, icpId, ['old'], now)).toEqual(new Map([['old', 55]]))
      expect(
         await PrismaService.client.icpJudgement.count({
            where: {
               userId,
               slug: 'old',
               icpId,
            },
         })
      ).toBe(1)
   })

   it('should delete judgements older than 30 days when pruned', async () => {
      await IcpJudgementService.save(userId, icpId, 'stale', 60, new Date(now.getTime() - 40 * DAY_MS))

      expect(await IcpJudgementService.prune(now)).toBeGreaterThanOrEqual(1)
      expect(
         await PrismaService.client.icpJudgement.count({
            where: {
               userId,
               slug: 'stale',
            },
         })
      ).toBe(0)
      expect(
         await PrismaService.client.icpJudgement.count({
            where: {
               userId,
               slug: 'ana',
            },
         })
      ).toBe(1)
   })
})
