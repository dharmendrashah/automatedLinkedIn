import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PersonScoreService } from './personScore.service'

import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. A rescore that waits for a profile read is finished by scoreWaiting once the read is in.

const db = PrismaService.client

let userId: string
let otherUserId: string
let icpId: string
let otherIcpId: string
let readPersonId: string
let unreadPersonId: string

const icp = (owner: string, name: string) =>
   db.icp.create({
      data: {
         userId: owner,
         name,
         includeTitles: ['founder'],
         excludeTitles: [],
         seniorities: [],
         industries: [],
         companySizes: [],
         locations: [],
         problemKeywords: [],
      },
   })

const person = (owner: string, slug: string, profileRead: boolean) =>
   db.person.create({
      data: {
         userId: owner,
         slug,
         name: slug,
         headline: 'Founder at Acme',
         lastTouchAt: new Date(),
         profileRead,
      },
   })

describe('PersonScoreService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      icpId = (await icp(userId, 'Founders')).id
      otherIcpId = (await icp(otherUserId, 'Theirs')).id
      readPersonId = (await person(userId, 'read-person', true)).id
      unreadPersonId = (await person(userId, 'unread-person', false)).id
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
   })

   it('should score a person whose profile was read, and store the score with its ideal customer', async () => {
      const result = await PersonScoreService.rescore(userId, readPersonId, icpId)

      expect(result).toMatchObject({
         state: 'SCORED',
         score: 30,
         disqualified: false,
         icpName: 'Founders',
      })

      const stored = await db.person.findUnique({
         where: { id: readPersonId },
         select: {
            icpScore: true,
            icpScoreIcpName: true,
            icpScoreWaitingFor: true,
         },
      })

      expect(stored).toEqual({
         icpScore: 30,
         icpScoreIcpName: 'Founders',
         icpScoreWaitingFor: null,
      })
   })

   it('should queue the profile read for a person not read yet, and wait for it', async () => {
      const result = await PersonScoreService.rescore(userId, unreadPersonId, icpId)

      expect(result).toEqual({ state: 'READING' })
      expect(
         await db.person.findUnique({
            where: { id: unreadPersonId },
            select: { icpScoreWaitingFor: true },
         })
      ).toEqual({ icpScoreWaitingFor: icpId })
   })

   it('should score a waiting person once the profile read is in', async () => {
      await db.person.update({
         where: { id: unreadPersonId },
         data: { profileRead: true },
      })

      expect(await PersonScoreService.scoreWaiting()).toBeGreaterThanOrEqual(1)
      expect(
         await db.person.findUnique({
            where: { id: unreadPersonId },
            select: {
               icpScore: true,
               icpScoreWaitingFor: true,
            },
         })
      ).toEqual({
         icpScore: 30,
         icpScoreWaitingFor: null,
      })
   })

   it('should answer nothing for a person of another owner', async () => {
      expect(await PersonScoreService.rescore(otherUserId, readPersonId, otherIcpId)).toBeNull()
   })

   it('should refuse an ideal customer the owner does not own', async () => {
      await expect(PersonScoreService.rescore(userId, readPersonId, otherIcpId)).rejects.toBeInstanceOf(ConflictError)
   })
})
