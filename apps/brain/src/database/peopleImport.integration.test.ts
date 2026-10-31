import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ClientService } from './client.service'
import { PeopleService } from './people.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. Importing people into My network (.plan/network-import-people.md).

const db = PrismaService.client
const url = (slug: string) => `https://www.linkedin.com/in/${slug}/`

let userId: string
let clientId: string

const personOf = (slug: string) =>
   db.person.findFirst({
      where: {
         userId,
         slug,
      },
      select: {
         labels: true,
         notes: true,
         doNotContact: true,
      },
   })

const readsOf = (slug: string) =>
   db.dataRead.count({
      where: {
         userId,
         slug,
         kind: 'PROFILE',
      },
   })

describe('PeopleService import (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      clientId = await ClientService.defaultId(userId)
      await db.suppression.create({
         data: {
            userId,
            slug: 'blocked-one',
         },
      })
      await PeopleService.add(userId, clientId, [{ url: url('listed-one') }], { name: 'Earlier' }, false)
   })

   afterAll(async () => {
      await db.user.delete({ where: { id: userId } })
   })

   it('should say what an import would do with each link, without changing anything', async () => {
      const preview = await PeopleService.preview(userId, clientId, [
         url('fresh-one'),
         url('blocked-one'),
         url('listed-one'),
         'https://example.com/nobody',
         url('fresh-one'),
      ])

      expect(preview?.profiles).toEqual([
         {
            url: 'https://www.linkedin.com/in/fresh-one',
            slug: 'fresh-one',
            inputs: [url('fresh-one'), url('fresh-one')],
            state: 'NEW',
         },
         {
            url: 'https://www.linkedin.com/in/blocked-one',
            slug: 'blocked-one',
            inputs: [url('blocked-one')],
            state: 'DO_NOT_CONTACT',
         },
         {
            url: 'https://www.linkedin.com/in/listed-one',
            slug: 'listed-one',
            inputs: [url('listed-one')],
            state: 'ALREADY_HERE',
         },
      ])
      expect(preview?.invalid).toBe(1)
      expect(await personOf('fresh-one')).toBeNull()
   })

   it('should add the new, label and note them, read their profiles, and never touch do-not-contact', async () => {
      const people = [
         {
            url: url('fresh-one'),
            labels: ['Founder', 'saas'],
            notes: 'Met at SaaStr',
         },
         {
            url: url('blocked-one'),
            labels: ['hot'],
         },
         {
            url: url('listed-one'),
            labels: ['warm'],
         },
         { url: 'not a link' },
      ]
      const result = await PeopleService.add(userId, clientId, people, { name: 'Imported' }, true)

      expect(result).toMatchObject({
         added: 1,
         skipped: 1,
         blocked: 1,
         invalid: 1,
         reading: 2,
         notRead: 0,
      })
      expect(await personOf('fresh-one')).toEqual({
         labels: ['founder', 'saas'],
         notes: 'Met at SaaStr',
         doNotContact: false,
      })
      expect((await personOf('listed-one'))?.labels).toEqual(['warm'])
      expect(await readsOf('fresh-one')).toBe(1)
      expect(await readsOf('blocked-one')).toBe(0)
      expect(await personOf('blocked-one')).toBeNull()

      const again = await PeopleService.add(userId, clientId, people, { name: 'Imported again' }, true)

      expect(again).toMatchObject({
         added: 0,
         skipped: 2,
      })
      expect(await personOf('fresh-one')).toMatchObject({
         labels: ['founder', 'saas'],
         notes: 'Met at SaaStr',
      })
      expect(await readsOf('fresh-one')).toBe(1)
   })
})
