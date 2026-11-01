import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type CollectOutcome, DataServiceError } from 'core/dataClient'

import { ConflictError, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent. A failed run goes on from the block that failed
// (.plan/workflow-engine-p4-lifecycle.md).

const email = `${randomUUID()}@elitale.com`

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

// A people search that is not set up until `fixed` is set, then answers with two people.
const search = () => {
   const state = { fixed: false }
   const client = {
      balanceMicros: vi.fn(async () => 50_000_000),
      findJob: vi.fn(async (): Promise<string | null> => null),
      cancel: vi.fn(async () => undefined),
      start: vi.fn(async () => {
         if (!state.fixed) {
            throw new DataServiceError('CONFIG', 'not configured')
         }

         return 'job-1'
      }),
      check: vi.fn(async (jobId: string): Promise<CollectOutcome | null> => ({
         jobId,
         status: 'completed',
         error: null,
         rows: [
            { profileUrl: 'https://www.linkedin.com/in/ada-lovelace' },
            { profileUrl: 'https://www.linkedin.com/in/alan-turing' },
         ],
         costMicros: 4_000,
      })),
   }

   return {
      state,
      client,
      deps: {
         client,
         signal: new AbortController().signal,
         log,
      },
   }
}

const graph: Graph = {
   nodes: [
      node('begin', 'trigger.manual'),
      node('who', 'collect.searchPeople', { keywords: 'sales' }),
      node('file', 'output.csv'),
   ],
   edges: [line('begin', 'who'), line('who', 'file')],
}

let userId: string

const failedRun = async (deps: ReturnType<typeof search>['deps']) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Resume ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const run = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `resume-${randomUUID()}`)
   const runId = run?.id ?? ''

   await advanceRun(runId, deps)
   await advanceRun(runId, deps)

   return {
      workflowId: workflow.id,
      runId,
   }
}

const stepsOf = async (runId: string) =>
   Object.fromEntries(
      (await PrismaService.client.workflowStepRun.findMany({ where: { runId } })).map(step => [step.nodeId, step])
   )

describe('resuming a failed run (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should run again from the block that failed, keeping what finished and the spend on the same run', async () => {
      const { client, state, deps } = search()
      const { runId } = await failedRun(deps)
      const before = await stepsOf(runId)

      expect(before.who?.status).toBe('FAILED')
      expect(before.file?.status).toBe('SKIPPED')
      expect((await WorkflowService.run(userId, runId))?.status).toBe('FAILED')

      state.fixed = true

      await expect(WorkflowService.resume(userId, runId)).resolves.toMatchObject({
         id: runId,
         status: 'RUNNING',
         finishedAt: null,
         message: null,
      })

      const reopened = await stepsOf(runId)

      expect(reopened.begin?.status).toBe('DONE')
      expect(reopened.who).toMatchObject({
         status: 'WAITING',
         errorCode: null,
         message: null,
      })
      expect(reopened.file?.status).toBe('WAITING')

      for (let round = 0; round < 3; round += 1) {
         await advanceRun(runId, deps)
      }

      const done = await stepsOf(runId)
      const run = await WorkflowService.run(userId, runId)

      expect(done.who).toMatchObject({
         status: 'DONE',
         itemsOut: 2,
      })
      expect(done.file).toMatchObject({
         status: 'DONE',
         itemsOut: 2,
      })
      expect(run).toMatchObject({
         status: 'SUCCEEDED',
         costMicros: 4_000,
      })
      expect(client.start).toHaveBeenCalledTimes(2)
   })

   it('should refuse a run that did not fail, one that is not the newest, and a run that is not the owner', async () => {
      const { state, deps } = search()
      const first = await failedRun(deps)

      state.fixed = true

      const second = await WorkflowService.startRun(userId, first.workflowId, 'MANUAL', `resume-${randomUUID()}`)

      await advanceRun(second?.id ?? '', deps)
      await advanceRun(second?.id ?? '', deps)

      await expect(WorkflowService.resume(userId, second?.id ?? '')).rejects.toBeInstanceOf(ConflictError)
      await expect(WorkflowService.resume(userId, first.runId)).rejects.toThrow('newest')
      await expect(WorkflowService.resume(randomUUID(), first.runId)).resolves.toBeNull()
   })
})
