import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { ClientService } from './client.service'
import { InputPickService } from './inputPick.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. A Profiles input block that takes people from My network.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let acme: string
let beta: string

const person = (clientId: string, slug: string, extra: Record<string, unknown> = {}, owner = userId) =>
   db.person.create({
      data: {
         userId: owner,
         clientId,
         slug,
         name: slug.toUpperCase(),
         labels: [],
         lastTouchAt: new Date('2026-10-10T00:00:00Z'),
         firstSeenAt: new Date('2026-10-01T00:00:00Z'),
         ...extra,
      },
   })

const taken = async (config: Record<string, unknown>) => {
   const filter = await InputPickService.filter(
      userId,
      inputPickOf('input.profiles', {
         source: 'network',
         ...config,
      }),
      null,
      'input.profiles'
   )

   return {
      slugs: (await LinkedInProfileService.pick(userId, 50, filter)).map(({ slug }) => slug).sort(),
      count: await InputPickService.count(userId, 'input.profiles', filter),
   }
}

describe('a Profiles input block from My network (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const other = (await UserService.create({ email: otherEmail })).id

      acme = (await ClientService.create(userId, 'Acme')).id
      beta = (await ClientService.create(userId, 'Beta')).id

      await person(acme, 'ana', {
         country: 'India',
         labels: ['fintech'],
      })
      await person(acme, 'ravi', {
         country: 'France',
         connectedAt: new Date('2026-10-05T00:00:00Z'),
         lastTouchAt: new Date('2026-10-20T00:00:00Z'),
      })
      await person(acme, 'mute', { doNotContact: true })
      await person(acme, 'blocked')
      await person(beta, 'ana', { country: 'India' })
      await person(beta, 'zoe', {
         firstSeenAt: new Date('2026-09-01T00:00:00Z'),
         lastTouchAt: new Date('2026-09-02T00:00:00Z'),
      })
      await person((await ClientService.create(other, 'Theirs')).id, 'stranger', {}, other)
      await db.suppression.create({
         data: {
            userId,
            slug: 'blocked',
         },
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should take every client once each, never Do not contact, suppressed or another owner, and count the same', async () => {
      expect(await taken({})).toEqual({
         slugs: ['ana', 'ravi', 'zoe'],
         count: 3,
      })
   })

   it('should take one client, and nobody for a client that is not the owner', async () => {
      expect((await taken({ client: beta })).slugs).toEqual(['ana', 'zoe'])
      expect((await taken({ client: randomUUID() })).count).toBe(0)
   })

   it('should apply the page filters and the block labels together', async () => {
      expect((await taken({ filters: JSON.stringify({ countries: ['India'] }) })).slugs).toEqual(['ana'])
      expect((await taken({ filters: JSON.stringify({ connection: 'CONNECTED' }) })).slugs).toEqual(['ravi'])
      expect((await taken({ labels: ['fintech'] })).slugs).toEqual(['ana'])
      expect((await taken({ withoutLabels: ['fintech'] })).slugs).toEqual(['ana', 'ravi', 'zoe'])
   })

   it('should take the time frame on the date asked, newest first by it, the first people when it is last contact', async () => {
      expect(
         (
            await taken({
               added: 'custom',
               from: '2026-09-15',
               to: '2026-10-31',
            })
         ).slugs
      ).toEqual(['ana', 'ravi'])
      expect(
         (
            await taken({
               dateField: 'connected',
               added: 'custom',
               from: '2026-10-01',
            })
         ).slugs
      ).toEqual(['ravi'])

      const filter = await InputPickService.filter(
         userId,
         inputPickOf('input.profiles', {
            source: 'network',
            dateField: 'lastContact',
            order: 'oldest',
         }),
         null,
         'input.profiles'
      )

      expect((await LinkedInProfileService.pick(userId, 1, filter)).map(({ slug }) => slug)).toEqual(['zoe'])
   })

   it('should take people from the profiles list as before when the source is the list', async () => {
      expect((await taken({ source: 'profiles' })).count).toBe(0)
   })
})
