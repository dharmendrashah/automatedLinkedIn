import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, SpiderSessionService, TaskService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The post itself is not asked of the spider: the request runs only what brain saves with it.

const email = `${randomUUID()}@elitale.com`
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`
const LINK = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'

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

const deps = () => ({
   client: fakeDataClient(() => ({
      rows: [],
      costMicros: 0,
   })),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

let userId: string
let accounts: string[]

const account = async () => {
   const sealed = CryptoService.seal('{}')

   return (
      await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status: 'ACTIVE',
         },
      })
   ).id
}

const post = (text: string) =>
   JSON.stringify([
      {
         id: 't1',
         type: 'TEXT',
         text,
      },
   ])

const graphOf = (text: string, withRetry = false): Graph => ({
   nodes: [
      node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
      node('select', 'account.select', { accounts }),
      node('write', 'account.writePost', { post: post(text) }),
      ...(withRetry
         ? [
              node('retry', 'logic.retry', {
                 times: 1,
                 waitSeconds: 0,
              }),
           ]
         : []),
      node('csv', 'output.csv'),
   ],
   edges: [
      line('people', 'select'),
      line('select', 'write'),
      ...(withRetry ? [line('write', 'retry'), line('retry', 'csv')] : [line('write', 'csv')]),
   ],
})

const start = async (graph: Graph, trigger: 'MANUAL' | 'PREVIEW' = 'MANUAL') => {
   const workflow = await WorkflowService.create(userId, {
      name: `Post ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

   return (await WorkflowService.startRun(userId, workflow.id, trigger, `post-${randomUUID()}`))?.id ?? ''
}

const postsOf = (runId: string) =>
   PrismaService.client.postPublication.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
   })

const run = (runId: string) => WorkflowService.run(userId, runId)

const passedOn = async (runId: string) =>
   (
      await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            nodeId: 'csv',
         },
         orderBy: { slug: 'asc' },
      })
   ).map(({ slug }) => slug)

describe('Write a post block (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         const id = randomUUID()

         await SpiderSessionService.startTask({
            id,
            userId,
            linkedInAccountId: options.accountId ?? '',
            task: 'linkedin-post',
            taskVersion: 1,
            trigger: 'manual',
            input: {},
            startedAt: new Date(),
         })
         await PrismaService.client.$transaction(async tx => {
            await options.onStart?.(id, tx)
         })

         return { id }
      })
   })

   // Each test has accounts of its own, so the quiet time between two posts of an account never reaches over from another.
   beforeEach(async () => {
      accounts = [await account(), await account()]
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should post once, wait for the result, then pass on everything that reached it, taking turns across accounts', async () => {
      const first = await start(graphOf('First post from a workflow'))

      await advanceRun(first, deps())
      await advanceRun(first, deps())

      const [made] = await postsOf(first)

      expect(await postsOf(first)).toHaveLength(1)
      expect(made).toMatchObject({
         state: 'SENDING',
         nodeId: 'write',
      })
      expect((await run(first))?.status).toBe('RUNNING')

      await PrismaService.client.postPublication.update({
         where: { id: made?.id ?? '' },
         data: {
            state: 'POSTED',
            postedAt: new Date(),
            link: LINK,
         },
      })
      await advanceRun(first, deps())

      expect(await passedOn(first)).toEqual(['ada', 'bob'])
      expect((await run(first))?.status).toBe('SUCCEEDED')

      const second = await start(graphOf('Second post from a workflow'))

      await advanceRun(second, deps())

      expect((await postsOf(second))[0]?.accountId).not.toBe(made?.accountId)
   })

   it('should post nothing in a preview', async () => {
      const runId = await start(graphOf('Never posted'), 'PREVIEW')

      await advanceRun(runId, deps())

      expect(await postsOf(runId)).toHaveLength(0)
      expect(await passedOn(runId)).toEqual(['ada', 'bob'])
   })

   it('should fail the run with the sentence of a post that did not go', async () => {
      const runId = await start(graphOf('A post that fails'))

      await advanceRun(runId, deps())

      const [made] = await postsOf(runId)

      await PrismaService.client.postPublication.update({
         where: { id: made?.id ?? '' },
         data: {
            state: 'FAILED',
            failure: 'It could not start in time. Nothing was posted.',
         },
      })
      await advanceRun(runId, deps())

      const finished = await run(runId)

      expect(finished?.status).toBe('FAILED')
      expect(finished?.steps.find(({ nodeId }) => nodeId === 'write')?.message).toBe(
         'It could not start in time. Nothing was posted.'
      )
      expect(await passedOn(runId)).toEqual([])
   })

   it('should make the post again only when a Retry gives the step another try', async () => {
      const runId = await start(graphOf('A post that is tried twice', true))

      await advanceRun(runId, deps())

      const [made] = await postsOf(runId)

      await PrismaService.client.postPublication.update({
         where: { id: made?.id ?? '' },
         data: {
            state: 'FAILED',
            failure: 'It could not start in time. Nothing was posted.',
         },
      })
      await advanceRun(runId, deps())
      await advanceRun(runId, deps())

      expect(await postsOf(runId)).toHaveLength(2)
   })
})
