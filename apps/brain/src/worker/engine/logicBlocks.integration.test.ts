import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { IcpService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`

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
let failing = false

const client = () =>
   fakeDataClient(slug =>
      failing
         ? {
              rows: [],
              costMicros: 0,
              status: 'failed',
              error: 'The service is busy',
           }
         : slug === 'posts'
           ? {
                rows: [
                   {
                      postUrl: 'https://www.linkedin.com/posts/someone_topic-activity-7452924970042826753-AbCd',
                      postAuthorUrl: profile('zed'),
                   },
                ],
                costMicros: 2_000,
             }
           : {
                rows: [],
                costMicros: 0,
             }
   )

const deps = () => ({
   client: client(),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

const start = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Logic ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

   return (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `logic-${randomUUID()}`))?.id ?? ''
}

const statusOf = async (runId: string) => (await WorkflowService.run(userId, runId))?.status

const stepOf = (runId: string, nodeId: string) =>
   PrismaService.client.workflowStepRun.findFirstOrThrow({
      where: {
         runId,
         nodeId,
      },
   })

const slugsAt = async (runId: string, nodeId: string) =>
   (
      await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            nodeId,
         },
         orderBy: { slug: 'asc' },
      })
   ).map(({ slug }) => slug)

// Starts a run whose Score block always fails the same way: the ideal customer it scores against is deleted after the start.
const failingRun = async (more: Graph) => {
   const icp = await IcpService.create(userId, {
      name: `Growth ${randomUUID().slice(0, 8)}`,
      includeTitles: ['growth'],
      excludeTitles: [],
      seniorities: [],
      industries: [],
      companySizes: [],
      locations: [],
      problemKeywords: [],
   })
   const runId = await start({
      nodes: [
         node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
         node('score', 'score.icp', { icpId: icp.id }),
         ...more.nodes,
      ],
      edges: [line('people', 'score'), ...more.edges],
   })

   await PrismaService.client.icp.delete({ where: { id: icp.id } })

   return runId
}

describe('Wait, Task result and Retry (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should still end the run as failed when nothing looks at the failed block', async () => {
      const runId = await failingRun({
         nodes: [node('csv', 'output.csv')],
         edges: [line('score', 'csv')],
      })

      await advanceRun(runId, deps())

      expect(await statusOf(runId)).toBe('FAILED')
   })

   it('should go on after a failure a Task result looks at, and send what reached the failed block to the Else side', async () => {
      const runId = await failingRun({
         nodes: [
            node('result', 'logic.taskResult'),
            node('list', 'output.csv'),
            node('else', 'logic.else'),
            node('no', 'output.csv'),
         ],
         edges: [line('score', 'result'), line('result', 'list'), line('result', 'else'), line('else', 'no')],
      })

      await advanceRun(runId, deps())

      expect((await stepOf(runId, 'score')).status).toBe('FAILED')
      expect(await slugsAt(runId, 'list')).toEqual([])
      expect(await slugsAt(runId, 'no')).toEqual(['ada', 'bob'])
      expect(await statusOf(runId)).toBe('PARTIAL')
   })

   it('should run a failing block again up to the number of tries, then end with gaps', async () => {
      const runId = await failingRun({
         nodes: [
            node('again', 'logic.retry', {
               times: 2,
               waitSeconds: 0,
            }),
            node('no', 'output.csv'),
         ],
         edges: [line('score', 'again'), line('again', 'no')],
      })

      await advanceRun(runId, deps())

      expect(await stepOf(runId, 'score')).toMatchObject({
         status: 'FAILED',
         tries: 2,
      })
      expect((await stepOf(runId, 'again')).message).toContain('failed after 3 tries')
      expect(await statusOf(runId)).toBe('PARTIAL')
   })

   it('should hold a retry back for its pause', async () => {
      const runId = await failingRun({
         nodes: [
            node('again', 'logic.retry', {
               times: 1,
               waitSeconds: 600,
            }),
         ],
         edges: [line('score', 'again')],
      })

      await advanceRun(runId, deps())

      expect(await stepOf(runId, 'score')).toMatchObject({
         status: 'WAITING',
         tries: 1,
      })
      expect((await stepOf(runId, 'score')).waitUntil?.getTime()).toBeGreaterThan(Date.now() + 500_000)
      expect(await statusOf(runId)).toBe('RUNNING')

      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'score',
         },
         data: { waitUntil: new Date(Date.now() - 1_000) },
      })
      await advanceRun(runId, deps())

      expect(await statusOf(runId)).toBe('PARTIAL')
   })

   it('should send again only the requests that failed, and go on when the second try works', async () => {
      failing = true

      const runId = await start({
         nodes: [
            node('find', 'collect.findPosts', {
               keywords: 'pipeline',
               howMany: 1,
            }),
            node('again', 'logic.retry', {
               times: 2,
               waitSeconds: 0,
            }),
         ],
         edges: [line('find', 'again')],
      })

      await advanceRun(runId, deps())

      // The service gave up on the request: it ran out of its own retries.
      await PrismaService.client.workflowStepCall.updateMany({
         where: { stepRun: { runId } },
         data: {
            status: 'FAILED',
            finishedAt: new Date(),
            retryAt: null,
            attempts: 5,
            error: 'The service is busy',
         },
      })
      failing = false
      await advanceRun(runId, deps())

      expect(await stepOf(runId, 'find')).toMatchObject({
         status: 'DONE',
         tries: 1,
      })
      expect(await slugsAt(runId, 'find')).toHaveLength(1)
      expect(await statusOf(runId)).toBe('SUCCEEDED')
   })

   it('should wait for its time, once, then pass everything on', async () => {
      const runId = await start({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada')] }),
            node('pause', 'logic.wait', {
               mode: 'exact',
               seconds: 600,
            }),
            node('csv', 'output.csv'),
         ],
         edges: [line('people', 'pause'), line('pause', 'csv')],
      })

      await advanceRun(runId, deps())

      const first = (await stepOf(runId, 'pause')).waitUntil

      expect(first?.getTime()).toBeGreaterThan(Date.now() + 500_000)
      expect(await statusOf(runId)).toBe('RUNNING')

      await advanceRun(runId, deps())

      expect((await stepOf(runId, 'pause')).waitUntil).toEqual(first)

      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'pause',
         },
         data: { waitUntil: new Date(Date.now() - 1_000) },
      })
      await advanceRun(runId, deps())

      expect(await slugsAt(runId, 'csv')).toEqual(['ada'])
      expect(await statusOf(runId)).toBe('SUCCEEDED')
   })
})
