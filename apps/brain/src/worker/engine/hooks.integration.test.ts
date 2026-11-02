import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import {
   HookService,
   IcpService,
   PrismaService,
   UserService,
   WalletService,
   WorkflowRunService,
   WorkflowService,
} from 'database'

import { type Graph, type GraphEdge, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. A block's hook starts its chain as a run of its own (.plan/workflow-events-and-hooks.md). The data service is a fake.

const email = `${randomUUID()}@elitale.com`
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`

const node = (
   id: string,
   type: GraphNode['type'],
   config: GraphNode['config'] = {},
   more: Partial<GraphNode> = {}
): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
   ...more,
})

const line = (from: string, to: string, fromPort?: GraphEdge['fromPort']): GraphEdge => ({
   from,
   to,
   ...(fromPort && { fromPort }),
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

const start = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Hooks ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const run = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `hooks-${randomUUID()}`)

   return {
      workflowId: workflow.id,
      runId: run?.id ?? '',
   }
}

const hookRunsOf = (hostRunId: string) =>
   PrismaService.client.workflowRun.findMany({
      where: {
         parentRunId: hostRunId,
         kind: 'HOOK',
      },
   })

const deliveriesOf = (hostRunId: string) =>
   PrismaService.client.workflowDelivery.findMany({
      where: { hostRunId },
      orderBy: { createdAt: 'asc' },
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

const people = () => node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] })

// A chain that tags what the hook was given and writes it to a file.
const chain = [node('hooked', 'process.tag', { tags: ['hooked'] }), node('hookCsv', 'output.csv')]
const chainLines = (port: GraphEdge['fromPort'], host: string) => [
   line(host, 'hooked', port),
   line('hooked', 'hookCsv'),
]

describe('block hooks (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should start the after chain as a run of its own with what the block gave, and never hold up the host', async () => {
      const { workflowId, runId } = await start({
         nodes: [people(), node('tag', 'process.tag', { tags: ['main'] }), node('csv', 'output.csv'), ...chain],
         edges: [line('people', 'tag'), line('tag', 'csv'), ...chainLines('after', 'tag')],
      })

      await advanceRun(runId, deps())

      const host = await WorkflowService.run(userId, runId)
      const [hook] = await hookRunsOf(runId)
      const [delivery] = await deliveriesOf(runId)

      expect(host?.status).toBe('SUCCEEDED')
      expect(host?.kind).toBe('MAIN')
      expect(hook).toMatchObject({
         kind: 'HOOK',
         trigger: 'HOOK',
         status: 'RUNNING',
         workflowId,
      })
      expect(delivery).toMatchObject({
         source: 'BLOCK',
         hostNodeId: 'tag',
         phase: 'after',
         status: 'STARTED',
         runId: hook.id,
      })
      // The run's graph is the main flow; the chain is kept apart.
      expect((host?.graph as Graph).nodes.map(({ id }) => id)).toEqual(['people', 'tag', 'csv'])

      // A hook run holds no live-run slot, shows in no history, and is not an alert.
      const next = await WorkflowService.startRun(userId, workflowId, 'MANUAL', `hooks-${randomUUID()}`)

      expect(next?.status).toBe('RUNNING')
      expect((await WorkflowService.runs(userId, workflowId)).map(({ id }) => id)).not.toContain(hook.id)
      expect(await HookService.summaryOf(userId, runId)).toEqual([
         {
            nodeId: 'tag',
            phase: 'after',
            fired: 1,
            running: 1,
            failed: 0,
            skipped: 0,
            reason: null,
            firstRunId: hook.id,
         },
      ])

      await advanceRun(hook.id, deps())

      expect((await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: hook.id } })).status).toBe(
         'SUCCEEDED'
      )
      expect(await slugsAt(hook.id, '__hook')).toEqual(['ada', 'bob'])
      expect(await slugsAt(hook.id, 'hookCsv')).toEqual(['ada', 'bob'])
   })

   it('should fire the after hook of a block that failed, with what reached it', async () => {
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
      const { runId } = await start({
         nodes: [people(), node('score', 'score.icp', { icpId: icp.id }), ...chain],
         edges: [line('people', 'score'), ...chainLines('after', 'score')],
      })

      await PrismaService.client.icp.delete({ where: { id: icp.id } })
      await advanceRun(runId, deps())

      const [hook] = await hookRunsOf(runId)

      expect((await WorkflowService.run(userId, runId))?.status).toBe('FAILED')
      expect(hook).toBeDefined()

      await advanceRun(hook.id, deps())

      expect(await slugsAt(hook.id, '__hook')).toEqual(['ada', 'bob'])
   })

   it('should write a skipped delivery when nothing reached the block, and start a run with zero items when asked to', async () => {
      const { runId } = await start({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada')] }, { hooks: { before: { when: 'items' } } }),
            node('late', 'process.tag', { tags: ['x'] }, { hooks: { before: { when: 'always' } } }),
            node('csv', 'output.csv'),
            ...chain,
            node('hooked2', 'process.tag', { tags: ['y'] }),
            node('hookCsv2', 'output.csv'),
         ],
         edges: [
            line('people', 'late'),
            line('late', 'csv'),
            line('people', 'hooked', 'before'),
            line('hooked', 'hookCsv'),
            line('late', 'hooked2', 'before'),
            line('hooked2', 'hookCsv2'),
         ],
      })

      await advanceRun(runId, deps())

      const deliveries = await deliveriesOf(runId)
      const first = deliveries.find(({ hostNodeId }) => hostNodeId === 'people')
      const second = deliveries.find(({ hostNodeId }) => hostNodeId === 'late')

      expect(first).toMatchObject({
         status: 'SKIPPED',
         reason: 'Nothing reached the block.',
      })
      expect(second?.status).toBe('STARTED')
   })

   it('should record one delivery for a moment however many times the step is taken', async () => {
      const { runId } = await start({
         nodes: [people(), node('tag', 'process.tag', { tags: ['main'] }), ...chain],
         edges: [line('people', 'tag'), ...chainLines('after', 'tag')],
      })

      await advanceRun(runId, deps())

      const run = await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: runId } })

      await HookService.fire({
         run,
         nodeId: 'tag',
         phase: 'after',
         round: 0,
         tries: 0,
         keys: [
            {
               nodeId: 'tag',
               round: 0,
            },
         ],
      })

      expect(await deliveriesOf(runId)).toHaveLength(1)
      expect(await hookRunsOf(runId)).toHaveLength(1)
   })

   it('should pass the owner Stop to a live hook run, and let a Stop block in a chain stop the host', async () => {
      const wait = node(
         'pause',
         'logic.wait',
         {
            mode: 'exact',
            amount: 600,
         },
         { hooks: { before: { when: 'always' } } }
      )
      const { runId } = await start({
         nodes: [people(), wait, node('csv', 'output.csv'), node('halt', 'logic.stop', { message: 'Enough.' })],
         edges: [line('people', 'pause'), line('pause', 'csv'), line('pause', 'halt', 'before')],
      })

      await advanceRun(runId, deps())

      const [hook] = await hookRunsOf(runId)

      expect(hook).toBeDefined()

      await advanceRun(hook.id, deps())

      const host = await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: runId } })

      expect((await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: hook.id } })).status).toBe(
         'FAILED'
      )
      expect(host.stopRequestedAt).not.toBeNull()
      expect(host.message).toBe('Enough.')

      await advanceRun(runId, deps())

      expect((await WorkflowService.run(userId, runId))?.status).toBe('STOPPED')

      // The Stop of the owner reaches a hook run that is still live.
      const second = await start({
         nodes: [people(), wait, node('csv', 'output.csv'), ...chain],
         edges: [line('people', 'pause'), line('pause', 'csv'), ...chainLines('before', 'pause')],
      })

      await advanceRun(second.runId, deps())

      const [live] = await hookRunsOf(second.runId)

      expect(live.stopRequestedAt).toBeNull()
      expect(await WorkflowService.requestStop(userId, second.runId)).toBe(true)
      expect(
         (await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: live.id } })).stopRequestedAt
      ).not.toBeNull()
   })

   it('should show failed fires of one hook as one alert a day, and dismiss them together', async () => {
      const wait = node(
         'pause',
         'logic.wait',
         {
            mode: 'exact',
            amount: 600,
         },
         { hooks: { before: { when: 'always' } } }
      )
      const { workflowId, runId } = await start({
         nodes: [people(), wait, node('csv', 'output.csv'), ...chain],
         edges: [line('people', 'pause'), line('pause', 'csv'), ...chainLines('before', 'pause')],
      })

      await advanceRun(runId, deps())

      const [hook] = await hookRunsOf(runId)

      await WorkflowRunService.failUnfinished(hook.id, 'The chain broke.', 'UNEXPECTED')

      const mine = (await WorkflowService.alerts(userId)).filter(alert => alert.workflowId === workflowId)

      expect(mine).toHaveLength(1)
      expect(mine[0].message).toBe('The before hook of Wait failed: The chain broke.')
      expect(await WorkflowService.dismissAlert(userId, hook.id)).toBe(true)
      expect((await WorkflowService.alerts(userId)).filter(alert => alert.workflowId === workflowId)).toHaveLength(0)
   })
})
