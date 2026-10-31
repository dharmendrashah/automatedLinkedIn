import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { InboxService } from './inbox.service'
import { InputPickService } from './inputPick.service'
import { LabelService } from './label.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const DAY_MS = 86_400_000

const profile = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
})

let userId: string
let otherUserId: string

const slugsOf = (rows: { slug: string }[]) => rows.map(({ slug }) => slug).sort()

const ageProfile = (slug: string, days: number) =>
   PrismaService.client.linkedInProfile.update({
      where: {
         userId_slug: {
            userId,
            slug,
         },
      },
      data: { createdAt: new Date(Date.now() - days * DAY_MS) },
   })

describe('labels and input picks (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should label what is added, merge labels into links already saved, and relabel in bulk', async () => {
      await LinkedInProfileService.addMany(userId, [profile('ada'), profile('bob')], ['acme'])
      await LinkedInProfileService.addMany(userId, [profile('bob'), profile('cy')], ['fintech'])

      const tagsOf = async () =>
         Object.fromEntries(
            (
               await PrismaService.client.linkedInProfile.findMany({
                  where: { userId },
                  select: {
                     slug: true,
                     tags: true,
                  },
               })
            ).map(({ slug, tags }) => [slug, tags])
         )

      await expect(tagsOf()).resolves.toEqual({
         ada: ['acme'],
         bob: ['acme', 'fintech'],
         cy: ['fintech'],
      })

      const { items } = await LinkedInProfileService.list(userId, {
         tags: ['acme', 'fintech'],
         tagMatch: 'all',
         page: 1,
         pageSize: 10,
      })

      expect(slugsOf(items)).toEqual(['bob'])

      const ids = items.map(({ id }) => id)

      await expect(
         LinkedInProfileService.labelMany(
            otherUserId,
            { id: { in: ids } },
            {
               add: ['stolen'],
               remove: [],
            }
         )
      ).resolves.toEqual({
         changed: 0,
         full: 0,
      })
      await LinkedInProfileService.labelMany(
         userId,
         { id: { in: ids } },
         {
            add: ['vip'],
            remove: ['acme'],
         }
      )
      await expect(tagsOf()).resolves.toMatchObject({ bob: ['fintech', 'vip'] })
   })

   it('should pick by when items were added, labels, status and order', async () => {
      await ageProfile('ada', 10)
      await ageProfile('cy', 2)
      await PrismaService.client.linkedInProfile.updateMany({
         where: {
            userId,
            slug: 'cy',
         },
         data: { status: 'CONTACTED' },
      })

      const pick = (config: Record<string, unknown>) =>
         InputPickService.filter(userId, inputPickOf('input.profiles', config), null).then(filter =>
            LinkedInProfileService.pick(userId, 10, filter)
         )

      expect(slugsOf(await pick({ added: '7d' }))).toEqual(['bob', 'cy'])
      expect(
         slugsOf(
            await pick({
               labels: ['fintech'],
               statuses: ['NEW'],
            })
         )
      ).toEqual(['bob'])
      expect(slugsOf(await pick({ withoutLabels: ['acme'] }))).toEqual(['bob', 'cy'])
      expect((await pick({ order: 'oldest' })).map(({ slug }) => slug)).toEqual(['ada', 'cy', 'bob'])
   })

   it('should take "since the last run" from the last successful run only, and everything before any', async () => {
      const list = await PrismaService.client.workflowList.create({
         data: {
            userId,
            name: `Picks ${randomUUID().slice(0, 8)}`,
         },
      })
      const workflow = await PrismaService.client.workflow.create({
         data: {
            userId,
            name: list.name,
            graph: {},
            outputListId: list.id,
         },
      })
      const run = (status: 'SUCCEEDED' | 'FAILED', daysAgo: number, trigger: 'MANUAL' | 'PREVIEW' = 'MANUAL') =>
         PrismaService.client.workflowRun.create({
            data: {
               workflowId: workflow.id,
               userId,
               trigger,
               runKey: randomUUID(),
               status,
               graph: {},
               qualifyScore: 60,
               maybeScore: 40,
               maybeEnabled: true,
               startedAt: new Date(Date.now() - daysAgo * DAY_MS),
            },
         })
      const since = async () =>
         (await InputPickService.filter(userId, inputPickOf('input.profiles', { added: 'lastRun' }), workflow.id)).since

      await expect(since()).resolves.toBeNull()

      await run('SUCCEEDED', 5)
      await run('FAILED', 1)
      await run('SUCCEEDED', 0.5, 'PREVIEW')

      const fiveDaysAgo = await since()

      expect(Date.now() - (fiveDaysAgo?.getTime() ?? 0)).toBeGreaterThan(4.9 * DAY_MS)
      await expect(InputPickService.lastRunAt(otherUserId, workflow.id)).resolves.toBeNull()
   })

   it('should count waiting posts that match, and list labels for their owner only', async () => {
      await LinkedInPostService.addMany(
         userId,
         [
            {
               slug: 'activity-7100000000000000001',
               url: 'https://www.linkedin.com/feed/update/urn:li:activity:7100000000000000001',
            },
         ],
         ['acme']
      )
      await LinkedInProfileService.addMany(otherUserId, [profile('zed')], ['secret'])

      const filter = await InputPickService.filter(userId, inputPickOf('input.posts', { labels: ['acme'] }), null)

      await expect(InputPickService.count(userId, 'input.posts', filter)).resolves.toBe(1)

      const labels = await LabelService.list(userId)

      expect(labels.map(({ label }) => label)).not.toContain('secret')
      expect(labels.find(({ label }) => label === 'acme')).toMatchObject({
         profiles: 1,
         posts: 1,
         total: 2,
      })
   })

   it('should list the labels the owner put on My network people', async () => {
      const client = await PrismaService.client.client.create({
         data: {
            userId,
            name: `Client ${randomUUID().slice(0, 8)}`,
         },
      })

      await PrismaService.client.person.create({
         data: {
            userId,
            clientId: client.id,
            slug: 'icp-person',
            labels: ['icp'],
            lastTouchAt: new Date(),
         },
      })

      expect((await LabelService.list(userId)).find(({ label }) => label === 'icp')).toMatchObject({
         people: 1,
         total: 1,
      })
   })

   it('should relabel people in the owner lists only', async () => {
      const list = await PrismaService.client.workflowList.create({
         data: {
            userId,
            name: `Inbox ${randomUUID().slice(0, 8)}`,
         },
      })
      const member = await PrismaService.client.workflowListMember.create({
         data: {
            listId: list.id,
            slug: 'dee',
            url: 'https://www.linkedin.com/in/dee',
         },
      })

      await expect(
         InboxService.labelMany(otherUserId, [member.id], {
            add: ['x'],
            remove: [],
         })
      ).resolves.toEqual({
         changed: 0,
         full: 0,
      })
      await InboxService.labelMany(userId, [member.id], {
         add: ['hot'],
         remove: [],
      })

      const { items } = await InboxService.inbox(userId, {
         view: 'ALL',
         tags: ['hot'],
         sort: 'newest',
         page: 1,
         pageSize: 10,
      })

      expect(items.map(({ slug }) => slug)).toEqual(['dee'])
   })
})
