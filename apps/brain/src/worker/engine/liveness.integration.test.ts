import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. A block runs only when something reaches it, and only the triggers that fired start a run
// (.plan/workflow-engine-p2-run-semantics.md).

const email = `${randomUUID()}@elitale.com`
const ADA = 'https://www.linkedin.com/in/ada-lovelace'
const ALAN = 'https://www.linkedin.com/in/alan-turing'

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

const log = {
   info: () => undefined,
   error: () => undefined,
}

let userId: string

const create = (graph: Graph) =>
   WorkflowService.create(userId, {
      name: `Reach ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

const run = async (
   graph: Graph,
   how: 'MANUAL' | 'API' | 'SCHEDULE' = 'MANUAL',
   post = vi.fn(async () => ({ status: 200 }))
) => {
   const { id } = await create(graph)
   const started = await WorkflowService.startRun(
      userId,
      id,
      how,
      `reach-${randomUUID()}`,
      how === 'API' ? { input: {} } : {}
   )
   const runId = started?.id ?? ''

   await advanceRun(runId, {
      client: fakeDataClient(() => ({
         rows: [],
         costMicros: 0,
      })),
      signal: new AbortController().signal,
      log,
      post,
   })

   const steps = Object.fromEntries(
      (await PrismaService.client.workflowStepRun.findMany({ where: { runId } })).map(step => [step.nodeId, step])
   )

   return {
      runId,
      steps,
      post,
      status: (await WorkflowService.run(userId, runId))?.status,
   }
}

beforeAll(async () => {
   userId = (await UserService.create({ email })).id
   await WalletService.save(50_000_000)
})

afterAll(async () => {
   await PrismaService.client.user.deleteMany({ where: { email } })
   await PrismaService.disconnect()
})

describe('a block runs only when something reaches it (database)', () => {
   it('should start nothing and send nothing behind an Else that got nobody', async () => {
      const child = await create({
         nodes: [node('begin', 'trigger.manual'), node('csv', 'output.csv')],
         edges: [line('begin', 'csv')],
      })
      const { steps, post, status } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA, ALAN] }),
            node('ok', 'logic.if'),
            node('rest', 'logic.else'),
            node('call', 'logic.runWorkflow', {
               workflowId: child.id,
               wait: 'none',
               send: 'input',
            }),
            node('send', 'output.sendApi', { url: 'https://example.com/hook' }),
            node('kept', 'output.csv'),
         ],
         edges: [
            line('begin', 'people'),
            line('people', 'ok'),
            line('ok', 'rest'),
            line('ok', 'kept'),
            line('rest', 'call'),
            line('rest', 'send'),
         ],
      })

      expect(steps.rest?.status).toBe('SKIPPED')
      expect(steps.call).toMatchObject({
         status: 'SKIPPED',
         message: expect.stringContaining('Nothing reached'),
      })
      expect(steps.send?.status).toBe('SKIPPED')
      expect(steps.kept?.status).toBe('DONE')
      expect(post).not.toHaveBeenCalled()
      expect(await PrismaService.client.workflowRun.count({ where: { workflowId: child.id } })).toBe(0)
      expect(status).toBe('SUCCEEDED')
   })

   it('should run what follows an Else that got people', async () => {
      const { steps } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA, ALAN] }),
            node('ok', 'logic.if', { minScore: 50 }),
            node('rest', 'logic.else'),
            node('kept', 'output.csv'),
         ],
         edges: [line('begin', 'people'), line('people', 'ok'), line('ok', 'rest'), line('rest', 'kept')],
      })

      expect(steps.rest?.status).toBe('DONE')
      expect(steps.kept).toMatchObject({
         status: 'DONE',
         itemsOut: 2,
      })
   })

   it('should give a line from the else output what the If kept aside, with no Else block', async () => {
      const { steps } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA, ALAN] }),
            node('ok', 'logic.if', { minScore: 50 }),
            node('passed', 'output.csv'),
            node('rest', 'output.csv'),
         ],
         edges: [
            line('begin', 'people'),
            line('people', 'ok'),
            line('ok', 'passed'),
            {
               ...line('ok', 'rest'),
               fromPort: 'else',
            },
         ],
      })

      expect(steps.passed?.status).toBe('SKIPPED')
      expect(steps.rest).toMatchObject({
         status: 'DONE',
         itemsOut: 2,
      })
   })

   it('should end the branch of an input that found nothing', async () => {
      const { steps, status } = await run({
         nodes: [node('begin', 'trigger.manual'), node('people', 'input.profiles'), node('kept', 'output.csv')],
         edges: [line('begin', 'people'), line('people', 'kept')],
      })

      expect(steps.people?.status).toBe('DONE')
      expect(steps.kept?.status).toBe('SKIPPED')
      expect(status).toBe('SUCCEEDED')
   })

   it('should keep a run going through a Wait that has no items, because the Wait itself was reached', async () => {
      const { steps } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('pause', 'logic.wait', {
               mode: 'exact',
               unit: 'seconds',
               amount: 1,
            }),
            node('kept', 'output.csv'),
         ],
         edges: [line('begin', 'pause'), line('pause', 'kept')],
      })

      expect(steps.begin?.status).toBe('DONE')
      expect(steps.pause?.status).toBe('WAITING')
      expect(steps.kept?.status).toBe('WAITING')
   })

   it('should run the chain of a Wait that was reached, once the wait is over', async () => {
      const { id } = await create({
         nodes: [
            node('begin', 'trigger.manual'),
            node('pause', 'logic.wait', {
               mode: 'exact',
               unit: 'seconds',
               amount: 1,
            }),
            node('kept', 'output.csv'),
         ],
         edges: [line('begin', 'pause'), line('pause', 'kept')],
      })
      const started = await WorkflowService.startRun(userId, id, 'MANUAL', `wait-${randomUUID()}`)
      const runId = started?.id ?? ''
      const deps = {
         client: fakeDataClient(() => ({
            rows: [],
            costMicros: 0,
         })),
         signal: new AbortController().signal,
         log,
      }

      await advanceRun(runId, deps)
      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'pause',
         },
         data: { waitUntil: new Date(Date.now() - 1_000) },
      })
      await advanceRun(runId, deps)

      const steps = Object.fromEntries(
         (await PrismaService.client.workflowStepRun.findMany({ where: { runId } })).map(step => [step.nodeId, step])
      )

      expect(steps.pause?.status).toBe('DONE')
      expect(steps.kept?.status).toBe('DONE')
   })
})

describe('only the triggers that fired start a run (database)', () => {
   const twoChains = (): Graph => ({
      nodes: [
         node('call', 'trigger.api'),
         node('fromApi', 'input.profiles', { links: [ADA] }),
         node('daily', 'trigger.schedule'),
         node('fromSchedule', 'input.profiles', { links: [ALAN] }),
      ],
      edges: [line('call', 'fromApi'), line('daily', 'fromSchedule')],
   })

   it('should leave the chain of another trigger alone', async () => {
      const { steps } = await run(twoChains(), 'API')

      expect(steps.fromApi?.itemsOut).toBe(1)
      expect(steps.daily?.status).toBe('SKIPPED')
      expect(steps.fromSchedule?.status).toBe('SKIPPED')
   })

   it('should run every chain when the run is started by hand', async () => {
      const { steps } = await run(twoChains(), 'MANUAL')

      expect(steps.fromApi?.itemsOut).toBe(1)
      expect(steps.fromSchedule?.itemsOut).toBe(1)
   })

   it('should run every trigger when the graph has none of the kind that started the run', async () => {
      const { steps } = await run(
         {
            nodes: [node('begin', 'trigger.manual'), node('people', 'input.profiles', { links: [ADA] })],
            edges: [line('begin', 'people')],
         },
         'API'
      )

      expect(steps.people?.itemsOut).toBe(1)
   })
})

describe('runs from before the rules (database)', () => {
   it('should run every block, as before, when the run is of the first engine version', async () => {
      const graph: Graph = {
         nodes: [node('begin', 'trigger.manual'), node('people', 'input.profiles'), node('kept', 'output.csv')],
         edges: [line('begin', 'people'), line('people', 'kept')],
      }
      const { id } = await create(graph)
      const started = await WorkflowService.startRun(userId, id, 'MANUAL', `old-${randomUUID()}`)
      const runId = started?.id ?? ''

      await PrismaService.client.workflowRun.update({
         where: { id: runId },
         data: { engineVersion: 1 },
      })
      await advanceRun(runId, {
         client: fakeDataClient(() => ({
            rows: [],
            costMicros: 0,
         })),
         signal: new AbortController().signal,
         log,
      })

      const kept = await PrismaService.client.workflowStepRun.findFirst({
         where: {
            runId,
            nodeId: 'kept',
         },
      })

      expect(kept?.status).toBe('DONE')
   })
})
