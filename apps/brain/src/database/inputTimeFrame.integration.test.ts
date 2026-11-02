import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { InputPickService } from './inputPick.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The time frame of an input block, from and to, on the added date and on the dates of a read.

const email = `${randomUUID()}@elitale.com`
const link = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})
const post = (id: number) => ({
   slug: `activity-${id}`,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}`,
})

let userId: string

const slugsOf = async (type: 'input.profiles' | 'input.companies' | 'input.posts', config: Record<string, unknown>) => {
   const filter = await InputPickService.filter(userId, inputPickOf(type, config), null, type)
   const rows =
      type === 'input.profiles'
         ? await LinkedInProfileService.pick(userId, 50, filter)
         : type === 'input.companies'
           ? await LinkedInCompanyService.pick(userId, 50, filter)
           : await LinkedInPostService.waiting(userId, 50, {
                ...filter,
                statuses: [],
             })

   return {
      slugs: rows.map(({ slug }) => slug).sort(),
      count: await InputPickService.count(userId, type, filter),
   }
}

describe('the time frame of an input block (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take what was added from the first day to the end of the last day, nothing outside', async () => {
      const added: [string, string][] = [
         ['before', '2026-10-01T23:59:59Z'],
         ['first', '2026-10-02T00:00:00Z'],
         ['last', '2026-10-03T23:59:59Z'],
         ['after', '2026-10-04T00:00:00Z'],
      ]

      await LinkedInProfileService.addMany(
         userId,
         added.map(([slug]) => link(slug))
      )

      for (const [slug, at] of added) {
         await PrismaService.client.linkedInProfile.updateMany({
            where: {
               userId,
               slug,
            },
            data: { createdAt: new Date(at) },
         })
      }

      expect(
         await slugsOf('input.profiles', {
            added: 'custom',
            from: '2026-10-02',
            to: '2026-10-03',
         })
      ).toEqual({
         slugs: ['first', 'last'],
         count: 2,
      })
      expect(
         (
            await slugsOf('input.profiles', {
               added: 'custom',
               to: '2026-10-02',
            })
         ).slugs
      ).toEqual(['before', 'first'])
      expect(
         (
            await slugsOf('input.profiles', {
               added: 'custom',
               from: '2026-10-03',
            })
         ).slugs
      ).toEqual(['after', 'last'])
      expect((await slugsOf('input.profiles', {})).count).toBe(4)
   })

   it('should take companies by the day they were last read, and none that were never read', async () => {
      await LinkedInCompanyService.addMany(
         userId,
         ['old', 'recent', 'never'].map(slug => ({
            slug,
            url: `https://www.linkedin.com/company/${slug}`,
         }))
      )

      for (const [slug, at] of [
         ['old', '2026-09-01T10:00:00Z'],
         ['recent', '2026-10-02T10:00:00Z'],
      ]) {
         await PrismaService.client.pageSnapshot.create({
            data: {
               userId,
               kind: 'COMPANY',
               slug: slug ?? '',
               data: {},
               fetchedAt: new Date(at ?? ''),
            },
         })
      }

      expect(
         await slugsOf('input.companies', {
            dateField: 'lastRead',
            added: 'custom',
            from: '2026-10-01',
            to: '2026-10-31',
         })
      ).toEqual({
         slugs: ['recent'],
         count: 1,
      })
      expect((await slugsOf('input.companies', { dateField: 'lastRead' })).count).toBe(3)
   })

   it('should take posts by the day they were posted, and none with no date or a date that is not one', async () => {
      const posted: [number, string | null][] = [
         [1, '2026-10-02T09:00:00.000Z'],
         [2, '2026-09-20T09:00:00.000Z'],
         [3, 'a while ago'],
         [4, null],
      ]

      await LinkedInPostService.addMany(
         userId,
         posted.map(([id]) => post(id))
      )

      for (const [id, postedAt] of posted) {
         await PrismaService.client.pageSnapshot.create({
            data: {
               userId,
               kind: 'POST',
               slug: `activity-${id}`,
               data: { postedAt },
            },
         })
      }

      expect(
         await slugsOf('input.posts', {
            dateField: 'posted',
            added: 'custom',
            from: '2026-10-01',
         })
      ).toEqual({
         slugs: ['activity-1'],
         count: 1,
      })
      expect(
         (
            await slugsOf('input.posts', {
               dateField: 'posted',
               added: 'custom',
               to: '2026-09-30',
            })
         ).slugs
      ).toEqual(['activity-2'])
      expect((await slugsOf('input.posts', { dateField: 'posted' })).count).toBe(4)
   })
})
