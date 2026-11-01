import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'
import { STUCK_HOURS, WorkflowRunService } from './workflowRun.service'

// Needs PostgreSQL. A run that made no progress for a long time, and holds nothing in the future, is ended
// (.plan/workflow-engine-p4-lifecycle.md).

const email = `${randomUUID()}@elitale.com`
const HOUR_MS = 3_600_000

const graph: Graph = {
   nodes: [
      {
         id: 'start',
         type: 'trigger.manual',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'file',
         type: 'output.csv',
         config: {},
         position: {
            x: 0,
            y: 100,
         },
      },
   ],
   edges: [
      {
         from: 'start',
         to: 'file',
      },
   ],
}

let userId: string

const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS)

// A live run of its own workflow, started `hours` ago.
const started = async (hours: number) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Stuck ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const run = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `stuck-${randomUUID()}`)
   const runId = run?.id ?? ''

   await PrismaService.client.workflowRun.update({
      where: { id: runId },
      data: { startedAt: hoursAgo(hours) },
   })

   return runId
}

const statusOf = async (runId: string) =>
   (await PrismaService.client.workflowRun.findUnique({ where: { id: runId } }))?.status

describe('stuck runs (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should end a run that made no progress, failing what had not finished', async () => {
      const runId = await started(STUCK_HOURS + 4)

      expect(await WorkflowRunService.endStuck()).toContain(runId)

      const run = await PrismaService.client.workflowRun.findUnique({
         where: { id: runId },
         include: { steps: true },
      })

      expect(run).toMatchObject({
         status: 'FAILED',
         message: expect.stringContaining('no progress'),
      })
      expect(run?.finishedAt).not.toBeNull()
      expect(run?.steps.map(({ status, errorCode }) => [status, errorCode])).toEqual([
         ['FAILED', 'RUN_STUCK'],
         ['FAILED', 'RUN_STUCK'],
      ])
   })

   it('should leave a run that is not old enough', async () => {
      const runId = await started(STUCK_HOURS - 4)

      expect(await WorkflowRunService.endStuck()).not.toContain(runId)
      expect(await statusOf(runId)).toBe('RUNNING')
   })

   it('should leave an old run whose step finished lately', async () => {
      const runId = await started(STUCK_HOURS + 4)

      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'start',
         },
         data: {
            status: 'DONE',
            finishedAt: hoursAgo(1),
         },
      })

      expect(await WorkflowRunService.endStuck()).not.toContain(runId)
      expect(await statusOf(runId)).toBe('RUNNING')
   })

   it('should leave an old run that holds a wait in the future', async () => {
      const runId = await started(STUCK_HOURS + 4)

      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'file',
         },
         data: { waitUntil: new Date(Date.now() + HOUR_MS) },
      })

      expect(await WorkflowRunService.endStuck()).not.toContain(runId)
      expect(await statusOf(runId)).toBe('RUNNING')
   })

   it('should leave an old run that waits for another run still going', async () => {
      const runId = await started(STUCK_HOURS + 4)
      const childId = await started(1)

      await PrismaService.client.workflowStepRun.updateMany({
         where: {
            runId,
            nodeId: 'file',
         },
         data: { childRunId: childId },
      })

      expect(await WorkflowRunService.endStuck()).not.toContain(runId)
      expect(await statusOf(runId)).toBe('RUNNING')
   })
})
