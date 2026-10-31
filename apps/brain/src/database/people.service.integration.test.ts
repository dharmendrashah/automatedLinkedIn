import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { snapshotFrom } from 'core'

import { peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import { ClientService } from './client.service'
import { ConflictError } from './conflict'
import { ALL_CLIENTS, PeopleService } from './people.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL, with the migration add_network_hub.

const db = PrismaService.client

let userId: string
let otherUserId: string
let clientId: string
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
      clientId,
      tab: 'EVERYONE',
      limit: 50,
      ...extra,
   })

describe('PeopleService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      clientId = (await ClientService.create(userId, 'Acme')).id
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
               clientId,
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
      expect(await PeopleService.filterOptions(userId, clientId)).toEqual({
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
      expect(await PeopleService.filterOptions(otherUserId, clientId)).toBeNull()
   })

   it('should find people by the start of a word, and by a profile link', async () => {
      expect((await view({ search: 'rav' }))?.items.map(({ name }) => name)).toEqual(['Ravi Kumar'])
      expect((await view({ search: 'https://www.linkedin.com/in/person-2/' }))?.items.map(({ name }) => name)).toEqual([
         'Mia Chen',
      ])
   })

   it("should never show another owner's client", async () => {
      expect(
         await PeopleService.list(otherUserId, {
            clientId,
            tab: 'EVERYONE',
            limit: 50,
         })
      ).toBeNull()
      expect(await PeopleService.counts(otherUserId, { clientId })).toBeNull()
   })

   it('should find the person of a profile for any page, and nobody of another owner', async () => {
      const found = await PeopleService.find(userId, 'person-1')

      expect((await PeopleService.get(userId, found?.id ?? ''))?.name).toBe('Ravi Kumar')
      expect(await PeopleService.find(otherUserId, 'person-1')).toBeNull()
      expect(await PeopleService.find(userId, 'nobody')).toBeNull()
   })

   it('should show every client of the owner together under All clients, and no one of another owner', async () => {
      const otherClientId = (await ClientService.create(userId, 'Beta')).id
      const betaAccount = await db.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
            clientId: otherClientId,
         },
      })

      await db.linkedInInvitation.create({
         data: {
            userId,
            accountId: betaAccount.id,
            linkedInId: randomUUID(),
            slug: 'beta-person',
            name: 'Bea Turner',
            headline: 'Buyer',
         },
      })
      await PeopleIndexService.refresh(userId, ['beta-person'])

      const all = await view({ clientId: ALL_CLIENTS })

      expect(all?.items.map(({ clientId: rowClient }) => rowClient).sort()).toEqual(
         [clientId, clientId, clientId, otherClientId].sort()
      )
      expect((await PeopleService.counts(userId, { clientId: ALL_CLIENTS }))?.EVERYONE).toBe(4)
      expect((await PeopleService.filterOptions(userId, ALL_CLIENTS))?.labels).toEqual([])
      expect(
         (
            await PeopleService.list(otherUserId, {
               clientId: ALL_CLIENTS,
               tab: 'EVERYONE',
               limit: 50,
            })
         )?.items ?? []
      ).toEqual([])

      await db.person.deleteMany({ where: { clientId: otherClientId } })
      await db.linkedInAccount.delete({ where: { id: betaAccount.id } })
      await db.client.delete({ where: { id: otherClientId } })
   })

   it('should count the tabs, and move a person out of Needs me when the owner closes them', async () => {
      expect(await PeopleService.counts(userId, { clientId })).toMatchObject({
         NEEDS_ME: 3,
         EVERYONE: 3,
         DO_NOT_CONTACT: 0,
      })
      expect(
         await PeopleService.counts(userId, {
            clientId,
            search: 'rav',
         })
      ).toMatchObject({
         NEEDS_ME: 1,
         EVERYONE: 1,
      })

      const [person] = (await view({ search: 'ana' }))?.items ?? []

      await PeopleService.update(userId, person?.id ?? '', { status: 'NOT_INTERESTED' })
      await PeopleIndexService.refresh(userId, ['person-0'])

      const closed = { status: 'NOT_INTERESTED' }

      expect((await PeopleService.counts(userId, { clientId }))?.NEEDS_ME).toBe(2)
      expect(await db.person.findUniqueOrThrow({ where: { id: person?.id ?? '' } })).toMatchObject(closed)
   })

   it('should erase a person everywhere and keep only their suppression and a dated entry', async () => {
      const [person] = (await view({ search: 'mia' }))?.items ?? []

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
   })

   it('should export a view with fixed columns and log it', async () => {
      const exported = await PeopleService.export(userId, {
         clientId,
         tab: 'EVERYONE',
      })

      expect(exported?.csv.split('\r\n')[0]).toBe(
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
            clientId,
            slug,
            lastTouchAt: new Date(),
         })),
      })

      await expect(
         PeopleService.export(userId, {
            clientId,
            tab: 'EVERYONE',
         })
      ).rejects.toBeInstanceOf(ConflictError)
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
