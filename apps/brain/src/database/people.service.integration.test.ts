import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { snapshotFrom } from 'core'

import { peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { PeopleService } from './people.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL, with the migration add_network_hub.

const db = PrismaService.client

let userId: string
let otherUserId: string
let accountId: string

const request = (slug: string, name: string) =>
   db.linkedInInvitation.create({
      data: {
         userId,
         accountId,
         linkedInId: randomUUID(),
         slug,
         name,
         headline: `${name} leads growth at Kite`,
      },
   })

const view = (extra: Partial<Parameters<typeof PeopleService.list>[1]> = {}) =>
   PeopleService.list(userId, {
      tab: 'EVERYONE',
      limit: 50,
      ...extra,
   })

describe('PeopleService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
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

      for (const [index, name] of ['Ana Silva', 'Ravi Kumar', 'Mia Chen'].entries()) {
         await request(`person-${index}`, name)
      }

      await PeopleIndexService.refresh(userId, ['person-0', 'person-1', 'person-2'])
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
   })

   it('should page through a tab by offset, never repeating a person', async () => {
      const first = await view({ limit: 2 })
      const second = await view({
         limit: 2,
         cursor: first?.next ?? undefined,
      })

      expect(first?.items).toHaveLength(2)
      expect(second?.items).toHaveLength(1)
      expect(second?.next).toBeNull()
      expect(new Set([...(first?.items ?? []), ...(second?.items ?? [])].map(({ id }) => id)).size).toBe(3)
      expect(first?.total).toBe(3)
   })

   it('should filter by what a profile read says, sort by a column, and offer the values to pick', async () => {
      await db.personSnapshot.create({
         data: {
            userId,
            slug: 'person-1',
            data: snapshotFrom({
               country: 'France',
               skills: ['Salesforce', { name: 'HubSpot' }],
               experience: [
                  {
                     position: 'Founder',
                     companyName: 'Kite',
                     endDate: null,
                  },
               ],
            }),
         },
      })
      await PeopleIndexService.refresh(userId, ['person-1'])

      const filtered = await view({
         filters: peopleFiltersSchema.parse({
            countries: ['france'],
            title: 'found',
            profileRead: true,
         }),
      })

      expect(filtered?.items.map(({ name, title, country }) => [name, title, country])).toEqual([
         ['Ravi Kumar', 'Founder', 'France'],
      ])
      expect(filtered?.total).toBe(1)
      expect(
         (await view({ filters: peopleFiltersSchema.parse({ profileRead: false }) }))?.items
            .map(({ name }) => name)
            .sort()
      ).toEqual(['Ana Silva', 'Mia Chen'])
      expect(
         (
            await view({
               sort: {
                  by: 'name',
                  desc: false,
               },
            })
         )?.items.map(({ name }) => name)
      ).toEqual(['Ana Silva', 'Mia Chen', 'Ravi Kumar'])
      expect(await PeopleService.filterOptions(userId)).toEqual({
         countries: [
            {
               value: 'France',
               count: 1,
            },
         ],
         companies: [
            {
               value: 'Kite',
               count: 1,
            },
         ],
         labels: [],
      })
   })

   it('should filter by the skills of the profile read, all of them by default, and offer them as typed', async () => {
      const names = async (skills: string[], skillsMode?: 'any') =>
         (
            await view({
               filters: peopleFiltersSchema.parse({
                  skills,
                  ...(skillsMode && { skillsMode }),
               }),
            })
         )?.items.map(({ name }) => name)

      expect(await names(['Salesforce', 'HubSpot'])).toEqual(['Ravi Kumar'])
      expect(await names(['Salesforce', 'Excel'])).toEqual([])
      expect(await names(['Salesforce', 'Excel'], 'any')).toEqual(['Ravi Kumar'])
      expect(await PeopleService.skillOptions(userId, 'sales')).toEqual([
         {
            value: 'Salesforce',
            count: 1,
         },
      ])
      expect(await PeopleService.skillOptions(userId, '%')).toEqual([])
   })

   it('should find people by the start of a word, and by a profile link', async () => {
      expect((await view({ search: 'rav' }))?.items.map(({ name }) => name)).toEqual(['Ravi Kumar'])
      expect((await view({ search: 'https://www.linkedin.com/in/person-2/' }))?.items.map(({ name }) => name)).toEqual([
         'Mia Chen',
      ])
   })

   it("should never show another owner's people", async () => {
      expect(
         (
            await PeopleService.list(otherUserId, {
               tab: 'EVERYONE',
               limit: 50,
            })
         ).items
      ).toEqual([])
      expect((await PeopleService.counts(otherUserId, {})).EVERYONE).toBe(0)
      expect(await PeopleService.filterOptions(otherUserId)).toEqual({
         countries: [],
         companies: [],
         labels: [],
      })
   })

   it('should find the person of a profile for any page, and nobody of another owner', async () => {
      const found = await PeopleService.find(userId, 'person-1')

      expect((await PeopleService.get(userId, found?.id ?? ''))?.name).toBe('Ravi Kumar')
      expect(await PeopleService.find(otherUserId, 'person-1')).toBeNull()
      expect(await PeopleService.find(userId, 'nobody')).toBeNull()
   })

   it('should call people new after the owner last left My network, and count them in Today', async () => {
      expect((await view()).items.some(({ isNew }) => isNew)).toBe(false)

      await PeopleService.seen(userId)
      await db.person.updateMany({
         where: {
            userId,
            slug: 'person-0',
         },
         data: { firstSeenAt: new Date(Date.now() + 60_000) },
      })

      expect((await view()).items.filter(({ isNew }) => isNew).map(({ slug }) => slug)).toEqual(['person-0'])
      expect((await view({ onlyNew: true })).items.map(({ slug }) => slug)).toEqual(['person-0'])
      expect((await PeopleService.today(userId)).fresh).toBe(1)
   })

   it('should list the owner accounts and lists for the pickers, and no one else', async () => {
      expect((await PeopleService.workspace(userId)).accounts.map(({ id }) => id)).toEqual([accountId])
      expect((await PeopleService.workspace(otherUserId)).accounts).toEqual([])
   })

   it('should count the tabs, and move a person out of Needs me when the owner closes them', async () => {
      expect(await PeopleService.counts(userId, {})).toMatchObject({
         NEEDS_ME: 3,
         EVERYONE: 3,
         DO_NOT_CONTACT: 0,
      })
      expect(await PeopleService.counts(userId, { search: 'rav' })).toMatchObject({
         NEEDS_ME: 1,
         EVERYONE: 1,
      })

      const [person] = (await view({ search: 'ana' }))?.items ?? []

      await PeopleService.update(userId, person?.id ?? '', { status: 'NOT_INTERESTED' })
      await PeopleIndexService.refresh(userId, ['person-0'])

      const closed = { status: 'NOT_INTERESTED' }

      expect((await PeopleService.counts(userId, {})).NEEDS_ME).toBe(2)
      expect(await db.person.findUniqueOrThrow({ where: { id: person?.id ?? '' } })).toMatchObject(closed)
   })

   it('should erase a person everywhere and keep only their suppression and a dated entry', async () => {
      const [person] = (await view({ search: 'mia' }))?.items ?? []

      const judged = await db.icp.create({
         data: {
            userId,
            name: 'Erasure judged',
            includeTitles: [],
            excludeTitles: [],
            seniorities: [],
            industries: [],
            companySizes: [],
            locations: [],
            problemKeywords: [],
         },
      })

      await db.icpJudgement.create({
         data: {
            userId,
            icpId: judged.id,
            slug: 'person-2',
            fit: 70,
         },
      })

      await PeopleService.erase(userId, person?.id ?? '')
      await PeopleIndexService.refresh(userId, ['person-2'])

      expect(
         await db.linkedInInvitation.count({
            where: {
               userId,
               slug: 'person-2',
            },
         })
      ).toBe(0)
      expect(
         await db.person.count({
            where: {
               userId,
               slug: 'person-2',
            },
         })
      ).toBe(0)
      expect(
         await db.suppression.count({
            where: {
               userId,
               slug: 'person-2',
            },
         })
      ).toBe(1)
      expect(await db.personErasure.count({ where: { userId } })).toBe(1)
      expect(
         await db.icpJudgement.count({
            where: {
               userId,
               slug: 'person-2',
            },
         })
      ).toBe(0)
   })

   it('should export a view with fixed columns and log it', async () => {
      const exported = await PeopleService.export(userId, { tab: 'EVERYONE' })

      expect(exported.csv.split('\r\n')[0]).toBe(
         '"Name","Profile link","Headline","Company","Reason","Found by","Fit","Status","Labels","Last touch"'
      )
      expect(await db.peopleExport.findFirst({ where: { userId } })).toMatchObject({
         rows: 2,
         refused: false,
      })
   })

   it('should refuse an export over the cap and log the refusal', async () => {
      const { EXPORT_CAP } = await import('./people.service')
      const slugs = Array.from({ length: EXPORT_CAP + 1 }, (_, index) => `bulk-${index}`)

      await db.person.createMany({
         data: slugs.map(slug => ({
            userId,
            slug,
            lastTouchAt: new Date(),
         })),
      })

      await expect(PeopleService.export(userId, { tab: 'EVERYONE' })).rejects.toBeInstanceOf(ConflictError)
      expect(
         await db.peopleExport.findFirst({
            where: {
               userId,
               refused: true,
            },
         })
      ).toMatchObject({ rows: 0 })
   }, 60_000)
})
