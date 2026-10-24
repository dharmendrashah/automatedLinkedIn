import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, TaskService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The visits themselves are not asked of the spider: the request runs only what brain saves with it.

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

const account = async (status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') => {
   const sealed = CryptoService.seal('{}')

   return (
      await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status,
         },
      })
   ).id
}

const graphOf = (chosen: string[], links: string[]): Graph => ({
   nodes: [
      node('people', 'input.profiles', { links }),
      node('select', 'account.select', { accounts: chosen }),
      node('visit', 'account.visitProfile'),
      node('csv', 'output.csv'),
   ],
   edges: [line('people', 'select'), line('select', 'visit'), line('visit', 'csv')],
})

const start = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Visit ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

   return (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `visit-${randomUUID()}`))?.id ?? ''
}

const visitsOf = (runId: string) =>
   PrismaService.client.linkedInPageVisit.findMany({
      where: { runId },
      orderBy: { slug: 'asc' },
   })

describe('select accounts and visit blocks (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      accounts = [await account(), await account(), await account()]
      vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         const id = randomUUID()

         await PrismaService.client.$transaction(async tx => {
            await options.onStart?.(id, tx)
         })

         return { id }
      })
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should give three people to three accounts in turn, wait for the visits, then hand on everyone it handled', async () => {
      const runId = await start(graphOf(accounts, [profile('ada'), profile('bob'), profile('cy')]))

      await advanceRun(runId, deps())

      const asked = await visitsOf(runId)

      expect(asked.map(({ slug }) => slug)).toEqual(['ada', 'bob', 'cy'])
      expect(new Set(asked.map(({ accountId }) => accountId))).toEqual(new Set(accounts))
      expect(asked.every(({ nodeId, status }) => nodeId === 'visit' && status === 'ASKED')).toBe(true)
      expect((await WorkflowService.run(userId, runId))?.status).toBe('RUNNING')

      // The spider answers: two went through, one led away.
      await PrismaService.client.linkedInPageVisit.updateMany({
         where: {
            runId,
            slug: { in: ['ada', 'bob'] },
         },
         data: { status: 'DONE' },
      })
      await PrismaService.client.linkedInPageVisit.updateMany({
         where: {
            runId,
            slug: 'cy',
         },
         data: { status: 'NOT_AVAILABLE' },
      })
      await advanceRun(runId, deps())

      const items = await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            nodeId: 'csv',
         },
         orderBy: { slug: 'asc' },
      })

      expect(items.map(({ slug }) => slug)).toEqual(['ada', 'bob', 'cy'])
      expect(await visitsOf(runId)).toHaveLength(3)
      expect((await WorkflowService.run(userId, runId))?.status).toBe('PARTIAL')
   })

   it('should let a Task result split the people viewed from the rest, and keep the rest for an Else', async () => {
      const runId = await start({
         nodes: [
            node('people', 'input.profiles', { links: [profile('fay'), profile('gus')] }),
            node('select', 'account.select', { accounts }),
            node('visit', 'account.visitProfile'),
            node('result', 'logic.taskResult'),
            node('yes', 'output.csv'),
            node('else', 'logic.else'),
            node('no', 'output.csv'),
         ],
         edges: [
            line('people', 'select'),
            line('select', 'visit'),
            line('visit', 'result'),
            line('result', 'yes'),
            line('result', 'else'),
            line('else', 'no'),
         ],
      })

      await advanceRun(runId, deps())
      await PrismaService.client.linkedInPageVisit.updateMany({
         where: {
            runId,
            slug: 'fay',
         },
         data: { status: 'DONE' },
      })
      await PrismaService.client.linkedInPageVisit.updateMany({
         where: {
            runId,
            slug: 'gus',
         },
         data: { status: 'NOT_AVAILABLE' },
      })
      await advanceRun(runId, deps())

      const at = async (nodeId: string) =>
         (
            await PrismaService.client.workflowItem.findMany({
               where: {
                  runId,
                  nodeId,
               },
            })
         ).map(({ slug }) => slug)

      expect(await at('yes')).toEqual(['fay'])
      expect(await at('no')).toEqual(['gus'])
   })

   it('should not visit anyone a chosen account viewed in the last 30 days, in another run', async () => {
      const runId = await start(graphOf(accounts, [profile('ada'), profile('dee')]))

      await advanceRun(runId, deps())

      expect((await visitsOf(runId)).map(({ slug }) => slug)).toEqual(['dee'])
   })

   it('should fail when none of the chosen accounts is the owner’s or signed in', async () => {
      const paused = await account('DISABLED')
      const foreign = await start(graphOf([randomUUID()], [profile('eve')]))
      const notSignedIn = await start(graphOf([paused], [profile('eve')]))

      await advanceRun(foreign, deps())
      await advanceRun(notSignedIn, deps())

      expect((await WorkflowService.run(userId, foreign))?.status).toBe('FAILED')
      expect((await WorkflowService.run(userId, notSignedIn))?.status).toBe('FAILED')
      expect(await visitsOf(foreign)).toEqual([])
      expect(await visitsOf(notSignedIn)).toEqual([])
   })
})
