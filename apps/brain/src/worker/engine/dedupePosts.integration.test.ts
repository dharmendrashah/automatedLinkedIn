import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { LinkedInPostService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`
const POST = 'https://www.linkedin.com/posts/someone_topic-activity-7452924970042826753-AbCd'

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

let userId: string
let asked = 0

const deps = () => ({
   client: fakeDataClient(slug => {
      if (slug === 'posts') {
         asked += 1
      }

      return slug === 'posts'
         ? {
              rows: [
                 {
                    postUrl: POST,
                    postAuthorUrl: 'https://www.linkedin.com/in/zed',
                 },
              ],
              costMicros: 2_000,
           }
         : {
              rows: [],
              costMicros: 0,
           }
   }),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Posts ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `posts-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   return runId
}

const slugsAt = async (runId: string, nodeId: string) =>
   (
      await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            nodeId,
         },
      })
   ).map(({ slug }) => slug)

const FIND = (postedWithin: string) =>
   node('find', 'collect.findPosts', {
      keywords: 'pipeline',
      howMany: 1,
      postedWithin,
      keep: true,
   })

const chain = (postedWithin: string): Graph => ({
   nodes: [
      FIND(postedWithin),
      node('dedupe', 'process.dedupe'),
      node('else', 'logic.else'),
      node('done', 'output.markPosts'),
   ],
   edges: [line('find', 'dedupe'), line('dedupe', 'else')],
})

describe('Remove duplicates on posts, and Find posts that never repeats a short search (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should pass a new post on and leave out one that was processed yesterday, to Else', async () => {
      const first = await run(chain('week'))
      const post = await PrismaService.client.linkedInPost.findFirstOrThrow({ where: { userId } })

      expect(await slugsAt(first, 'dedupe')).toHaveLength(1)
      expect(await slugsAt(first, 'else')).toEqual([])

      await LinkedInPostService.setStatusMany(userId, [post.id], 'PROCESSED')

      const second = await run(chain('week'))

      expect(await slugsAt(second, 'dedupe')).toEqual([])
      expect(await slugsAt(second, 'else')).toHaveLength(1)
   })

   it('should ask again for a search of the last 24 hours, but remember a search of a month', async () => {
      asked = 0
      await run(chain('24h'))
      await run(chain('24h'))

      expect(asked).toBe(2)

      asked = 0
      await run(chain('month'))
      await run(chain('month'))

      expect(asked).toBe(1)
   })
})
