import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { InputPickService } from './inputPick.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The time frames, filters and order a Profiles block takes from My network (.plan/lead-pipeline-p1-foundations.md).

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const NOW = new Date('2026-11-04T10:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() - offset * 24 * 60 * 60 * 1000)

let userId: string

const person = (slug: string, extra: Record<string, unknown> = {}) =>
   db.person.create({
      data: {
         userId,
         slug,
         name: slug.toUpperCase(),
         labels: [],
         lastTouchAt: day(1),
         firstSeenAt: day(60),
         ...extra,
      },
   })

const taken = async (config: Record<string, unknown>, limit = 50) => {
   const filter = await InputPickService.filter(
      userId,
      inputPickOf('input.profiles', {
         source: 'network',
         timeZone: 'UTC',
         ...config,
      }),
      null,
      'input.profiles',
      NOW
   )

   return (await LinkedInProfileService.pick(userId, limit, filter)).map(({ slug }) => slug)
}

describe('a Profiles block from My network: time frames, presets and order (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      // Invited 25, 21, 20 and 3 days ago; one never invited.
      await person('old', {
         inviteState: 'PENDING',
         invitedAt: day(25),
         waiting: true,
         lastSentAt: day(25),
         score: 70,
      })
      await person('edge', {
         inviteState: 'PENDING',
         invitedAt: day(21),
         waiting: true,
         lastSentAt: day(5),
         score: 90,
      })
      await person('near', {
         inviteState: 'PENDING',
         invitedAt: day(20),
         score: 40,
      })
      await person('new', {
         inviteState: 'PENDING',
         invitedAt: day(3),
         score: null,
      })
      await person('fresh', {
         fit: 'STRONG',
         score: 80,
         company: 'Kite Labs',
         companySlug: 'kite-labs',
      })
      await person('nolink', {
         company: 'Moth Inc',
         fit: 'MAYBE',
      })
      await person('chatted', {
         connectedAt: day(40),
         lastSentAt: day(10),
      })
      await db.linkedInCompany.createMany({
         data: [
            {
               userId,
               slug: 'kite-labs',
               url: 'https://www.linkedin.com/company/kite-labs/',
               name: 'Kite Labs',
               tags: ['target'],
            },
            {
               userId,
               slug: 'moth',
               url: 'https://www.linkedin.com/company/moth/',
               name: 'Moth Inc',
               tags: ['target'],
            },
            {
               userId,
               slug: 'other',
               url: 'https://www.linkedin.com/company/other/',
               name: 'Other Co',
               tags: ['skip'],
            },
         ],
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take people invited 21 days ago or more with "Older than N days" on the invite date', async () => {
      expect(
         (
            await taken({
               dateField: 'invitedOn',
               added: 'olderThan',
               days: 21,
            })
         ).sort()
      ).toEqual(['edge', 'old'])
   })

   it('should take people invited between N and M days ago, both days included', async () => {
      expect(
         (
            await taken({
               dateField: 'invitedOn',
               added: 'between',
               days: 21,
               daysTo: 20,
            })
         ).sort()
      ).toEqual(['edge', 'near'])
      expect(
         await taken({
            dateField: 'invitedOn',
            added: 'between',
            days: 5,
            daysTo: 0,
         })
      ).toEqual(['new'])
   })

   it('should take the people we wrote to last, and with an older last message', async () => {
      expect((await taken({ filters: JSON.stringify({ waiting: true }) })).sort()).toEqual(['edge', 'old'])
      expect(
         (
            await taken({
               filters: JSON.stringify({ waiting: true }),
               dateField: 'lastSent',
               added: 'olderThan',
               days: 4,
            })
         ).sort()
      ).toEqual(['edge', 'old'])
      expect(
         await taken({
            filters: JSON.stringify({ waiting: true }),
            dateField: 'lastSent',
            added: 'olderThan',
            days: 6,
         })
      ).toEqual(['old'])
   })

   it('should take the preset Untouched: not connected, never invited, never messaged', async () => {
      expect(
         (
            await taken({
               filters: JSON.stringify({
                  connection: 'NOT_CONNECTED',
                  invites: ['NONE'],
                  neverMessaged: true,
               }),
            })
         ).sort()
      ).toEqual(['fresh', 'nolink'])
   })

   it('should take people by the fit of their lists', async () => {
      expect(
         (
            await taken({
               filters: JSON.stringify({
                  fit: ['STRONG'],
                  invites: ['NONE'],
               }),
            })
         ).sort()
      ).toEqual(['fresh'])
   })

   it('should take people who work at a company saved with a label, by link or by name', async () => {
      expect((await taken({ filters: JSON.stringify({ worksAt: ['target'] }) })).sort()).toEqual(['fresh', 'nolink'])
      expect(await taken({ filters: JSON.stringify({ worksAt: ['skip'] }) })).toEqual([])
      expect(await taken({ filters: JSON.stringify({ worksAt: ['nothing'] }) })).toEqual([])
   })

   it('should put the best score first and people with no score last', async () => {
      expect(await taken({ order: 'score' }, 4)).toEqual(['edge', 'fresh', 'old', 'near'])
      expect((await taken({ order: 'score' })).at(-1)).not.toBe('edge')
   })
})
