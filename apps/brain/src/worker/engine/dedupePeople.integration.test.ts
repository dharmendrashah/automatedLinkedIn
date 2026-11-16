import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent. Remove duplicates leaves out the people the owner already
// has, is connected to, has invited, or read in the last 30 days (.plan/skip-known-posts-and-people.md).

const email = `${randomUUID()}@elitale.com`
const POST = 'https://www.linkedin.com/posts/someone_topic-activity-7452924970042826770-AbCd'
const DAY_MS = 24 * 60 * 60 * 1000
const SLUGS = [
   'fresh',
   'connected',
   'pending',
   'queued',
   'accepted',
   'ended',
   'none-not-connected',
   'read-5-days-ago',
   'read-40-days-ago',
   'in-a-list',
   'do-not-contact',
]

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

let userId: string

const deps = () => ({
   client: fakeDataClient(slug =>
      slug === 'post-comments'
         ? {
              rows: SLUGS.map(each => ({
                 commenterUrl: `https://www.linkedin.com/in/${each}`,
                 commenterName: each,
                 commenterType: 'profile',
                 comment: 'Great',
              })),
              costMicros: 1_000,
           }
         : {
              rows: [],
              costMicros: 0,
           }
   ),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

const graphWith = (dedupe: GraphNode['config'] = {}): Graph => ({
   nodes: [
      node('commenters', 'collect.commentersFromLinks', { links: [POST] }),
      node('dedupe', 'process.dedupe', dedupe),
   ],
   edges: [
      {
         from: 'commenters',
         to: 'dedupe',
      },
   ],
})

const passed = async (dedupe: GraphNode['config'] = {}) => {
   const workflow = await WorkflowService.create(userId, {
      name: `People ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph: graphWith(dedupe),
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `people-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   const items = await PrismaService.client.workflowItem.findMany({
      where: {
         runId,
         nodeId: 'dedupe',
      },
   })
   const step = await PrismaService.client.workflowStepRun.findFirstOrThrow({
      where: {
         runId,
         nodeId: 'dedupe',
      },
   })

   return {
      slugs: items.map(({ slug }) => slug).sort(),
      message: step.message,
   }
}

describe('Remove duplicates on people (database)', () => {
   beforeAll(async () => {
      const db = PrismaService.client

      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)

      const person = (slug: string, extra: Record<string, unknown>) =>
         db.person.create({
            data: {
               userId,
               slug,
               name: slug,
               lastTouchAt: new Date(),
               ...extra,
            },
         })

      await person('connected', { connectedAt: new Date() })
      await person('pending', { inviteState: 'PENDING' })
      await person('queued', { inviteState: 'QUEUED' })
      await person('accepted', {
         inviteState: 'ACCEPTED',
         connectedAt: new Date(),
      })
      await person('ended', { inviteState: 'ENDED' })
      await person('none-not-connected', { inviteState: 'NONE' })
      await db.personSnapshot.createMany({
         data: [
            {
               userId,
               slug: 'read-5-days-ago',
               data: {},
               fetchedAt: new Date(Date.now() - 5 * DAY_MS),
            },
            {
               userId,
               slug: 'read-40-days-ago',
               data: {},
               fetchedAt: new Date(Date.now() - 40 * DAY_MS),
            },
         ],
      })
      await db.suppression.create({
         data: {
            userId,
            slug: 'do-not-contact',
         },
      })

      const list = await db.workflowList.create({
         data: {
            userId,
            name: `Mine ${randomUUID().slice(0, 8)}`,
         },
      })

      await db.workflowListMember.create({
         data: {
            listId: list.id,
            slug: 'in-a-list',
            name: 'in-a-list',
            url: 'https://www.linkedin.com/in/in-a-list',
         },
      })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should leave out people already connected, invited or read in the last 30 days, and say how many', async () => {
      const { slugs, message } = await passed()

      expect(slugs).toEqual(['fresh', 'none-not-connected', 'read-40-days-ago'])
      expect(message).toBe('5 already connected or invited and 1 read in the last 30 days were left out.')
   })

   it('should keep them when the settings are switched off', async () => {
      const { slugs } = await passed({
         skipConnected: false,
         skipRead: false,
      })

      expect(slugs).toEqual([
         'accepted',
         'connected',
         'ended',
         'fresh',
         'none-not-connected',
         'pending',
         'queued',
         'read-40-days-ago',
         'read-5-days-ago',
      ])
   })
})
