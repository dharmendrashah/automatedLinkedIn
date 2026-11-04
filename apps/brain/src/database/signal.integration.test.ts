import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ColleaguesService } from './colleagues.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PeopleService } from './people.service'
import { PrismaService } from './prisma.service'
import { RetentionService } from './retention.service'
import { SignalService } from './signal.service'
import { UserService } from './user.service'

// Needs PostgreSQL (.plan/lead-pipeline-p7-ranking.md).

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

let userId: string
let otherId: string

const person = (owner: string, slug: string, fields: { company?: string; sent?: number; got?: number } = {}) =>
   PrismaService.client.person.create({
      data: {
         userId: owner,
         slug,
         name: slug,
         company: fields.company ?? null,
         lastSentAt: fields.sent === undefined ? null : daysAgo(fields.sent),
         lastReceivedAt: fields.got === undefined ? null : daysAgo(fields.got),
         lastTouchAt: new Date(),
      },
   })

const signalsOf = async (owner: string, slug: string) =>
   (await SignalService.forPeople(owner, [slug])).get(slug)?.map(({ type }) => type) ?? []

describe('signals, colleagues and stopping contact (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should write a signal once per type, source and day, and add one for another source or day', async () => {
      const at = new Date()
      const row = (via: string, when = at) => ({
         slug: 'ada',
         type: 'commented' as const,
         via,
         at: when,
      })

      expect(await SignalService.recordPeople(userId, [row('post-1'), row('post-1')])).toBe(1)
      expect(await SignalService.recordPeople(userId, [row('post-1')])).toBe(0)
      expect(await SignalService.recordPeople(userId, [row('post-2'), row('post-1', daysAgo(2))])).toBe(2)
      expect(await signalsOf(userId, 'ada')).toHaveLength(3)
      expect(await signalsOf(otherId, 'ada')).toEqual([])
   })

   it('should cut a long excerpt, and clear it after 90 days and delete the row after a year', async () => {
      await SignalService.recordPeople(userId, [
         {
            slug: 'bea',
            type: 'commented',
            via: 'p',
            at: daysAgo(100),
            excerpt: 'x'.repeat(500),
         },
         {
            slug: 'bea',
            type: 'reacted',
            via: 'p',
            at: daysAgo(400),
         },
      ])

      const before = await PrismaService.client.personSignal.findMany({
         where: {
            userId,
            slug: 'bea',
         },
      })

      expect(before.find(({ type }) => type === 'commented')?.excerpt).toHaveLength(140)

      await RetentionService.run()

      const after = await PrismaService.client.personSignal.findMany({
         where: {
            userId,
            slug: 'bea',
         },
      })

      expect(after.map(({ type, excerpt }) => [type, excerpt])).toEqual([['commented', null]])
      // The reader never sees a row older than a year, even before the job has run.
      expect(await signalsOf(userId, 'bea')).toEqual(['commented'])
   })

   it('should keep company signals apart from people and by owner', async () => {
      expect(
         await SignalService.recordCompanies(userId, [
            {
               slug: 'acme',
               type: 'hiring',
               via: 'job-1',
               at: new Date(),
            },
         ])
      ).toBe(1)
      expect((await SignalService.forCompanies(userId, ['acme'])).get('acme')?.map(({ type }) => type)).toEqual([
         'hiring',
      ])
      expect((await SignalService.forCompanies(otherId, ['acme'])).size).toBe(0)
   })

   it('should write no signal for a person on Do not contact, and delete theirs when stopped or erased', async () => {
      await person(userId, 'cy')
      await person(userId, 'dee')
      await SignalService.recordPeople(userId, [
         {
            slug: 'cy',
            type: 'asked',
            via: 'p',
            at: new Date(),
         },
         {
            slug: 'dee',
            type: 'asked',
            via: 'p',
            at: new Date(),
         },
      ])

      expect(await PeopleService.stopContacting(userId, ['cy', 'newcomer'])).toBe(2)
      expect(await signalsOf(userId, 'cy')).toEqual([])
      expect(
         await SignalService.recordPeople(userId, [
            {
               slug: 'cy',
               type: 'asked',
               via: 'q',
               at: new Date(),
            },
         ])
      ).toBe(0)

      const cy = await PrismaService.client.person.findFirst({
         where: {
            userId,
            slug: 'cy',
         },
      })
      const suppressed = await PrismaService.client.suppression.findMany({ where: { userId } })

      expect(cy?.doNotContact).toBe(true)
      expect(suppressed.map(({ slug }) => slug).sort()).toEqual(['cy', 'newcomer'])
      // A second call is safe.
      expect(await PeopleService.stopContacting(userId, ['cy'])).toBe(1)

      const dee = await PrismaService.client.person.findFirstOrThrow({
         where: {
            userId,
            slug: 'dee',
         },
      })

      await PeopleService.erase(userId, dee.id)

      expect(await signalsOf(userId, 'dee')).toEqual([])
   })

   it('should tell when colleagues were last reached and when they wrote back, by company name in any case', async () => {
      await person(userId, 'e1', {
         company: 'Initech',
         sent: 2,
         got: 9,
      })
      await person(userId, 'e2', {
         company: 'INITECH',
         got: 20,
      })
      await person(userId, 'f1', { company: 'Other' })
      await person(otherId, 'e3', {
         company: 'Initech',
         sent: 1,
      })

      const found = await ColleaguesService.ofCompanies(userId, ['initech', 'Nowhere'])

      expect([...found.keys()]).toEqual(['initech'])
      expect(
         found
            .get('initech')
            ?.map(({ slug }) => slug)
            .sort()
      ).toEqual(['e1', 'e2'])
      expect(found.get('initech')?.find(({ slug }) => slug === 'e1')?.lastContactAt).toBeInstanceOf(Date)
      expect((await ColleaguesService.ofCompanies(userId, [])).size).toBe(0)
   })

   it('should name the companies that carry a label, and no archived ones', async () => {
      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'initech',
            url: 'https://www.linkedin.com/company/initech',
         },
      ])
      await PrismaService.client.linkedInCompany.updateMany({
         where: {
            userId,
            slug: 'initech',
         },
         data: {
            name: 'Initech',
            tags: ['customer'],
         },
      })

      expect([...(await ColleaguesService.labelled(userId, 'customer'))]).toEqual(['initech'])
      expect((await ColleaguesService.labelled(userId, 'prospect')).size).toBe(0)
      expect((await ColleaguesService.labelled(otherId, 'customer')).size).toBe(0)
   })
})
