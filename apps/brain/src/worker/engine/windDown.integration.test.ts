import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type CollectOutcome, DataServiceError } from 'core/dataClient'
import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent. What happens to the blocks around a Stop or a failure
// (.plan/workflow-engine-p0-safety.md).

const email = `${randomUUID()}@elitale.com`
const ADA = 'https://www.linkedin.com/in/ada-lovelace'

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

const start = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Wind down ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

   return (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `wind-${randomUUID()}`))?.id ?? ''
}

const stepsOf = async (runId: string) =>
   Object.fromEntries(
      (await PrismaService.client.workflowStepRun.findMany({ where: { runId } })).map(step => [step.nodeId, step])
   )

// The one second wait named `gate` is over, so the block after it goes next. The database does not promise which ready
// block goes first, so a test that needs an order holds the block behind a gate.
const openGate = (runId: string) =>
   PrismaService.client.workflowStepRun.updateMany({
      where: {
         runId,
         nodeId: 'gate',
      },
      data: { waitUntil: new Date(Date.now() - 1_000) },
   })

// A data service where a domain lookup stays in flight until `finish` is called, and a people search is not set up.
const brokenSearch = () => {
   const state = { finished: false }
   const client = {
      balanceMicros: vi.fn(async () => 50_000_000),
      findJob: vi.fn(async (): Promise<string | null> => null),
      cancel: vi.fn(async () => undefined),
      start: vi.fn(async (slug: string) => {
         if (slug === 'profiles') {
            throw new DataServiceError('CONFIG', 'not configured')
         }

         return 'job-1'
      }),
      check: vi.fn(async (jobId: string): Promise<CollectOutcome | null> =>
         state.finished
            ? {
                 jobId,
                 status: 'completed',
                 error: null,
                 rows: [],
                 costMicros: 5_000,
              }
            : null
      ),
   }

   return {
      state,
      client,
   }
}

describe('stopping and failing runs (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should not start a block after Stop: it is skipped, nothing is sent, and the run ends stopped', async () => {
      const post = vi.fn(async () => ({ status: 200 }))
      const client = fakeDataClient(() => ({
         rows: [],
         costMicros: 0,
      }))
      const deps = {
         client,
         signal: new AbortController().signal,
         log,
         post,
      }
      const runId = await start({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA] }),
            node('pause', 'logic.wait', {
               mode: 'exact',
               unit: 'hours',
               amount: 1,
            }),
            node('send', 'output.sendApi', { url: 'https://example.com/hook' }),
         ],
         edges: [line('begin', 'people'), line('people', 'pause'), line('pause', 'send')],
      })

      await advanceRun(runId, deps)
      await expect(WorkflowService.requestStop(userId, runId)).resolves.toBe(true)
      await advanceRun(runId, deps)

      const steps = await stepsOf(runId)

      expect(post).not.toHaveBeenCalled()
      expect(steps.pause?.status).toBe('DONE')
      expect(steps.send).toMatchObject({
         status: 'SKIPPED',
         message: expect.stringContaining('stopped'),
      })
      expect((await WorkflowService.run(userId, runId))?.status).toBe('STOPPED')
   })

   it('should book the paid request of another branch after a failure, start nothing new, and then end failed', async () => {
      const { client, state } = brokenSearch()
      const runId = await start({
         nodes: [
            node('begin', 'trigger.manual'),
            node('sites', 'collect.domainLookup', { domains: ['stripe.com'] }),
            node('more', 'collect.domainLookup', { domains: ['acme.io'] }),
            node('gate', 'logic.wait', {
               mode: 'exact',
               unit: 'seconds',
               amount: 1,
            }),
            node('who', 'collect.searchPeople', { keywords: 'sales' }),
         ],
         edges: [line('begin', 'sites'), line('sites', 'more'), line('begin', 'gate'), line('gate', 'who')],
      })
      const deps = {
         client,
         signal: new AbortController().signal,
         log,
      }

      // The lookup is in flight and the gate is waiting; then the gate opens and the search fails.
      await advanceRun(runId, deps)
      await openGate(runId)
      await advanceRun(runId, deps)

      const during = await stepsOf(runId)

      expect(during.who?.status).toBe('FAILED')
      expect(during.more?.status).toBe('SKIPPED')
      expect((await WorkflowService.run(userId, runId))?.status).toBe('RUNNING')

      state.finished = true
      await advanceRun(runId, deps)

      const ended = await WorkflowService.run(userId, runId)
      const ledger = await PrismaService.client.spendLedger.findMany({ where: { runId } })

      expect(ended).toMatchObject({
         status: 'FAILED',
         costMicros: 5_000,
      })
      expect(ledger).toHaveLength(1)
      expect(client.start.mock.calls.filter(([slug]) => slug === 'domain-lookup')).toHaveLength(1)
   })

   it('should not hold a failed run for a Wait in another branch', async () => {
      const { client } = brokenSearch()
      const runId = await start({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA] }),
            node('pause', 'logic.wait', {
               mode: 'exact',
               unit: 'days',
               amount: 1,
            }),
            node('gate', 'logic.wait', {
               mode: 'exact',
               unit: 'seconds',
               amount: 1,
            }),
            node('who', 'collect.searchPeople', { keywords: 'sales' }),
         ],
         edges: [line('begin', 'people'), line('people', 'pause'), line('begin', 'gate'), line('gate', 'who')],
      })
      const deps = {
         client,
         signal: new AbortController().signal,
         log,
      }

      await advanceRun(runId, deps)
      await openGate(runId)
      await advanceRun(runId, deps)

      const steps = await stepsOf(runId)

      expect(steps.who?.status).toBe('FAILED')
      expect(steps.pause).toMatchObject({
         status: 'PARTIAL',
         message: expect.stringContaining('failed'),
      })
      expect((await WorkflowService.run(userId, runId))?.status).toBe('FAILED')
   })
})
