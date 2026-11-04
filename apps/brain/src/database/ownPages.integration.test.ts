import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { OwnPagesService } from './ownPages.service'
import { PeopleService } from './people.service'
import { PrismaService } from './prisma.service'
import { RetentionService } from './retention.service'
import { UserService } from './user.service'

// Needs PostgreSQL (.plan/lead-pipeline-p9-new-reads.md).

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const NOW = new Date()
const DAY_MS = 86_400_000

let userId: string
let otherId: string

const row = (kind: 'viewed' | 'reacted' | 'accepted', slug: string | null, time: string | null = '2h') => ({
   kind,
   name: null,
   slug,
   time,
})

describe('OwnPagesService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should store notifications once, drop a person on Do not contact, and write a signal for each kind that is one', async () => {
      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: 'stopped',
         },
      })

      const rows = [row('viewed', 'ada'), row('reacted', 'ada', '1d'), row('accepted', 'stopped'), row('viewed', null)]
      const file = { rows }

      expect(await OwnPagesService.importNotifications(userId, 'acc-1', file, NOW)).toEqual({
         stored: 3,
         dropped: 1,
      })
      expect(await OwnPagesService.importNotifications(userId, 'acc-1', file, NOW)).toEqual({
         stored: 0,
         dropped: 1,
      })

      const found = await OwnPagesService.notifications(userId, ['acc-1'], new Date(NOW.getTime() - 7 * DAY_MS), [])

      expect(found.rows).toBe(3)
      expect([...found.people]).toEqual([['ada', expect.objectContaining({ count: 2 })]])
      expect(found.people.get('ada')?.kinds.sort()).toEqual(['reacted', 'viewed'])

      const signals = await PrismaService.client.personSignal.findMany({
         where: {
            userId,
            slug: 'ada',
         },
      })

      expect(signals.map(({ type }) => type).sort()).toEqual(['engagedOurPost', 'viewed'])
      expect((await OwnPagesService.notifications(otherId, ['acc-1'], new Date(0), [])).rows).toBe(0)
   })

   it('should store viewers, groups and people apart, and say how many were only counted in groups', async () => {
      await OwnPagesService.importViewers(
         userId,
         'acc-1',
         {
            total: 13,
            periodDays: 90,
            groups: [
               {
                  kind: 'works-at',
                  company: 'Acme',
                  count: 3,
               },
            ],
            people: [
               {
                  name: 'Bob',
                  slug: 'bob',
                  headline: null,
                  time: '3d',
               },
            ],
         },
         NOW
      )

      expect(await OwnPagesService.viewers(userId, ['acc-1'], new Date(NOW.getTime() - 30 * DAY_MS))).toEqual({
         people: ['bob'],
         groups: 3,
      })
   })

   it('should keep a post once by its hash and read the authors back by kind', async () => {
      const post = (hash: string, kind: 'post' | 'lifeEvent') => ({
         authorName: null,
         authorSlug: 'cy',
         degree: null,
         hash,
         text: 'hello',
         time: '1d',
         kind,
      })
      const file = { posts: [post('h1', 'post'), post('h2', 'lifeEvent')] }

      expect((await OwnPagesService.importFeed(userId, 'acc-1', file, NOW)).stored).toBe(2)
      expect((await OwnPagesService.importFeed(userId, 'acc-1', file, NOW)).stored).toBe(0)

      const since = new Date(NOW.getTime() - 3 * DAY_MS)

      expect(await OwnPagesService.feed(userId, ['acc-1'], since, ['lifeEvent'])).toEqual({
         posts: 1,
         authors: new Map([['cy', 'lifeEvent']]),
      })
   })

   it('should replace a mutual read with a newer one and write a signal when there is a mutual connection', async () => {
      const file = (count: number) => ({
         people: [
            {
               slug: 'dee',
               count,
               mutual: [
                  {
                     name: null,
                     slug: 'bob',
                  },
               ],
            },
         ],
      })

      await OwnPagesService.importMutual(userId, 'acc-1', file(2), NOW)
      await OwnPagesService.importMutual(userId, 'acc-1', file(5), NOW)

      expect(await OwnPagesService.mutual(userId, ['acc-1'], ['dee', 'eve'])).toEqual(
         new Map([
            [
               'dee',
               {
                  count: 5,
                  mutual: ['bob'],
               },
            ],
         ])
      )
      expect(
         (
            await PrismaService.client.personSignal.findMany({
               where: {
                  userId,
                  slug: 'dee',
                  type: 'mutual',
               },
            })
         ).length
      ).toBe(1)
   })

   it('should delete what was kept about a person when they are stopped, and old rows when retention runs', async () => {
      await PeopleService.stopContacting(userId, ['dee', 'bob', 'cy', 'ada'])

      const db = PrismaService.client

      expect(
         await db.accountNotification.count({
            where: {
               userId,
               slug: 'ada',
            },
         })
      ).toBe(0)
      expect(
         await db.profileViewer.count({
            where: {
               userId,
               slug: 'bob',
            },
         })
      ).toBe(0)
      expect(
         await db.feedPost.count({
            where: {
               userId,
               authorSlug: 'cy',
            },
         })
      ).toBe(0)
      expect(
         await db.mutualRead.count({
            where: {
               userId,
               slug: 'dee',
            },
         })
      ).toBe(0)

      await OwnPagesService.importFeed(
         userId,
         'acc-2',
         {
            posts: [
               {
                  authorName: null,
                  authorSlug: null,
                  degree: null,
                  hash: 'old',
                  text: 'old',
                  time: '3w',
                  kind: 'post',
               },
               {
                  authorName: null,
                  authorSlug: null,
                  degree: null,
                  hash: 'new',
                  text: 'new',
                  time: '1d',
                  kind: 'post',
               },
            ],
         },
         NOW
      )
      await RetentionService.run()

      expect((await db.feedPost.findMany({ where: { accountId: 'acc-2' } })).map(({ hash }) => hash)).toEqual(['new'])
   })
})
