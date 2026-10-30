import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DATA_READS } from './dataReads'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. A stored profile read saves the person's current company to /companies (.plan/network-person-drawer.md).

const db = PrismaService.client

let userId: string

const readProfile = (slug: string, company: { name: string; link: string }) =>
   DATA_READS.PROFILE.store(
      {
         userId,
         slug,
         params: {},
      },
      [
         {
            firstName: 'Ada',
            experience: [
               {
                  position: 'Founder',
                  companyName: company.name,
                  companyLinkedinUrl: company.link,
                  endDate: null,
               },
            ],
         },
      ]
   )

const companies = () =>
   db.linkedInCompany.findMany({
      where: { userId },
      select: {
         slug: true,
         name: true,
         archivedAt: true,
      },
      orderBy: { slug: 'asc' },
   })

describe('DATA_READS.PROFILE (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
   })

   afterAll(async () => {
      await db.user.delete({ where: { id: userId } })
   })

   it('should save the current company once, keep an archived one archived, and keep a name the owner had', async () => {
      await readProfile('ada', {
         name: 'Lumen Labs',
         link: 'https://www.linkedin.com/company/Lumen-Labs/',
      })
      await readProfile('grace', {
         name: 'Lumen Labs Ltd',
         link: 'https://www.linkedin.com/company/lumen-labs',
      })

      expect(await companies()).toEqual([
         {
            slug: 'lumen-labs',
            name: 'Lumen Labs',
            archivedAt: null,
         },
      ])

      const archivedAt = new Date()

      await db.linkedInCompany.updateMany({
         where: { userId },
         data: { archivedAt },
      })
      await readProfile('ada', {
         name: 'Lumen Labs',
         link: 'https://www.linkedin.com/company/lumen-labs',
      })

      expect((await companies())[0]?.archivedAt).toEqual(archivedAt)
      expect(await db.personSnapshot.count({ where: { userId } })).toBe(2)
   })

   it('should save no company when the read gives no LinkedIn company link', async () => {
      const before = (await companies()).length

      await readProfile('alan', {
         name: 'Bletchley',
         link: 'https://example.com/company/bletchley',
      })

      expect(await companies()).toHaveLength(before)
   })

   it('should save every past company too, labelled as found on profiles, and leave saved ones as they are', async () => {
      await db.linkedInCompany.create({
         data: {
            userId,
            slug: 'kite',
            url: 'https://www.linkedin.com/company/kite',
            tags: ['Mine'],
         },
      })
      await DATA_READS.PROFILE.store(
         {
            userId,
            slug: 'edsger',
            params: {},
         },
         [
            {
               experience: [
                  {
                     companyName: 'Kite',
                     companyLinkedinUrl: 'https://www.linkedin.com/company/kite/',
                     endDate: null,
                  },
                  {
                     companyName: 'Mathematisch Centrum',
                     companyLinkedinUrl: 'https://www.linkedin.com/company/mathematisch-centrum/',
                     endDate: '1962',
                  },
               ],
            },
         ]
      )

      const saved = await db.linkedInCompany.findMany({
         where: {
            userId,
            slug: { in: ['kite', 'mathematisch-centrum'] },
         },
         select: {
            slug: true,
            name: true,
            tags: true,
         },
         orderBy: { slug: 'asc' },
      })

      expect(saved).toEqual([
         {
            slug: 'kite',
            name: 'Kite',
            tags: ['Mine'],
         },
         {
            slug: 'mathematisch-centrum',
            name: 'Mathematisch Centrum',
            tags: ['From profiles'],
         },
      ])
   })
})
