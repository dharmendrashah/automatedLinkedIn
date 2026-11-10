import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LABEL_MAX } from '@automatedLinkedIn/contracts'

import { LinkedInProfileService } from './linkedInProfile.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PeopleLabelService } from './peopleLabels.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
let userId: string

const profile = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})

// Adds the profile and builds its Person row, as the people index does on its pass.
const person = async (slug: string) => {
   await LinkedInProfileService.addMany(userId, [profile(slug)], [])
   await PeopleIndexService.refresh(userId, [slug])
}

const labelsOf = async (slug: string) =>
   (
      await PrismaService.client.person.findUniqueOrThrow({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { labels: true },
      })
   ).labels

const setLabels = (slug: string, labels: string[]) =>
   PrismaService.client.person.update({
      where: {
         userId_slug: {
            userId,
            slug,
         },
      },
      data: { labels },
   })

const manual = (count: number) => Array.from({ length: count }, (_, index) => `manual-${index}`)

describe('people labels (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should label the people that have a row and count the rest, when not asked to build', async () => {
      await person('ada')

      await expect(
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'ada',
                  tags: ['lead-x'],
               },
               {
                  slug: 'nobody',
                  tags: ['lead-x'],
               },
            ],
            { build: false }
         )
      ).resolves.toEqual({
         dropped: 0,
         withoutRow: 1,
      })
      await expect(labelsOf('ada')).resolves.toEqual(['lead-x'])
      await expect(
         PrismaService.client.person.findUnique({
            where: {
               userId_slug: {
                  userId,
                  slug: 'nobody',
               },
            },
         })
      ).resolves.toBeNull()
   })

   it('should build the row through the index when asked, then label it', async () => {
      await LinkedInProfileService.addMany(userId, [profile('bob')], [])

      await expect(
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'bob',
                  tags: ['lead-x'],
               },
            ],
            { build: true }
         )
      ).resolves.toEqual({
         dropped: 0,
         withoutRow: 0,
      })
      await expect(labelsOf('bob')).resolves.toEqual(['lead-x'])
   })

   it('should keep every existing label, even above the cap, and add none when there is no room', async () => {
      await person('cy')
      await setLabels('cy', manual(LABEL_MAX + 5))

      await expect(
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'cy',
                  tags: ['lead-x'],
               },
            ],
            { build: false }
         )
      ).resolves.toEqual({
         dropped: 1,
         withoutRow: 0,
      })
      await expect(labelsOf('cy')).resolves.toEqual(manual(LABEL_MAX + 5))
   })

   it('should append only distinct new tags, in first-seen order, up to the cap, and count the dropped ones', async () => {
      await person('dee')
      await setLabels('dee', manual(LABEL_MAX - 2))

      await expect(
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'dee',
                  tags: ['a', 'a', 'b', 'c', 'd'],
               },
            ],
            { build: false }
         )
      ).resolves.toEqual({
         dropped: 2,
         withoutRow: 0,
      })
      await expect(labelsOf('dee')).resolves.toEqual([...manual(LABEL_MAX - 2), 'a', 'b'])
   })

   it('should label a rerun the same way, and not count a tag already there as dropped', async () => {
      await person('eve')

      await PeopleLabelService.label(
         userId,
         [
            {
               slug: 'eve',
               tags: ['lead-x', 'vip'],
            },
         ],
         { build: false }
      )

      await expect(
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'eve',
                  tags: ['lead-x', 'vip'],
               },
            ],
            { build: false }
         )
      ).resolves.toEqual({
         dropped: 0,
         withoutRow: 0,
      })
      await expect(labelsOf('eve')).resolves.toEqual(['lead-x', 'vip'])
   })

   it('should add each tag once when two writers label the same row at the same time', async () => {
      await person('fay')

      await Promise.all([
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'fay',
                  tags: ['x', 'z'],
               },
            ],
            { build: false }
         ),
         PeopleLabelService.label(
            userId,
            [
               {
                  slug: 'fay',
                  tags: ['y', 'z'],
               },
            ],
            { build: false }
         ),
      ])

      const labels = await labelsOf('fay')

      expect([...labels].sort()).toEqual(['x', 'y', 'z'])
   })
})
