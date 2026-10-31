import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CompanyPageService } from './companyPage.service'
import { CompanyPeopleService } from './companyPeople.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL (.plan/company-network-people.md).

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const RIVULET = {
   slug: 'rivulet-iq',
   names: ['Rivulet Digital Private Limited'],
}

let userId: string
let agencyId: string

const person = (
   owner: string,
   clientId: string,
   slug: string,
   fields: { company?: string; companySlug?: string; doNotContact?: boolean; daysAgo?: number } = {}
) =>
   PrismaService.client.person.create({
      data: {
         userId: owner,
         clientId,
         slug,
         name: slug,
         company: fields.company ?? null,
         companySlug: fields.companySlug ?? null,
         doNotContact: fields.doNotContact ?? false,
         lastTouchAt: new Date(Date.now() - (fields.daysAgo ?? 0) * 86_400_000),
      },
   })

describe('CompanyPeopleService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const otherId = (await UserService.create({ email: otherEmail })).id
      const mine = await PrismaService.client.client.create({
         data: {
            userId,
            name: 'My accounts',
         },
      })
      const agency = await PrismaService.client.client.create({
         data: {
            userId,
            name: 'Agency',
         },
      })
      const theirs = await PrismaService.client.client.create({
         data: {
            userId: otherId,
            name: 'Theirs',
         },
      })

      agencyId = agency.id
      await person(userId, mine.id, 'purvi', {
         companySlug: 'rivulet-iq',
         company: 'Rivulet iQ',
         daysAgo: 2,
      })
      await person(userId, agency.id, 'purvi', {
         companySlug: 'rivulet-iq',
         daysAgo: 1,
      })
      await person(userId, mine.id, 'ravi', { company: 'RIVULET DIGITAL PRIVATE LIMITED' })
      await person(userId, mine.id, 'stop', {
         companySlug: 'rivulet-iq',
         doNotContact: true,
      })
      await person(userId, mine.id, 'elsewhere', { company: 'Acme' })
      await person(otherId, theirs.id, 'stranger', { companySlug: 'rivulet-iq' })
      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'rivulet-iq',
            url: 'https://www.linkedin.com/company/rivulet-iq',
         },
      ])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should list the owner\u2019s people by link or name once each, Do not contact last, and never another owner\u2019s', async () => {
      const { total, people } = await CompanyPeopleService.atCompany(userId, RIVULET)

      expect(total).toBe(3)
      expect(
         people.map(({ slug, matchedBy, clients, doNotContact }) => [slug, matchedBy, clients, doNotContact])
      ).toEqual([
         ['ravi', 'NAME', ['My accounts'], false],
         ['purvi', 'LINK', ['Agency', 'My accounts'], false],
         ['stop', 'LINK', ['My accounts'], true],
      ])
   })

   it('should narrow to one client and count a page of companies', async () => {
      await expect(CompanyPeopleService.atCompany(userId, RIVULET, agencyId)).resolves.toMatchObject({ total: 1 })

      const counts = await CompanyPeopleService.counts(userId, [
         RIVULET,
         {
            slug: 'acme',
            names: ['acme'],
         },
      ])

      expect(counts.get('rivulet-iq')?.count).toBe(3)
      expect(counts.get('acme')).toEqual({
         count: 1,
         first: [
            {
               slug: 'elsewhere',
               name: 'elsewhere',
               photoUrl: null,
            },
         ],
      })
   })

   it('should answer for the owner\u2019s company only', async () => {
      await expect(CompanyPageService.people(userId, 'rivulet-iq')).resolves.toMatchObject({ total: 2 })
      await expect(CompanyPageService.people(userId, 'nobody')).resolves.toBeNull()
   })
})
