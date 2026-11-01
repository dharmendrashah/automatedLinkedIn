import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { MAX_QUEUED, WorkflowService } from './workflow.service'
import { WorkflowRunService } from './workflowRun.service'

// Needs PostgreSQL. A start while a run is live waits its turn (.plan/workflow-engine-p4-lifecycle.md).

const email = `${randomUUID()}@elitale.com`

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
   ],
   edges: [],
}

let userId: string
let workflowId: string

const start = (trigger: 'MANUAL' | 'API' | 'SCHEDULE' | 'PREVIEW' | 'WORKFLOW' = 'MANUAL', parentRunId?: string) =>
   WorkflowService.startRun(userId, workflowId, trigger, `queue-${randomUUID()}`, { parentRunId })

const statusOf = async (id: string | undefined) =>
   (await PrismaService.client.workflowRun.findUnique({ where: { id } }))?.status

describe('queued runs (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   // A new workflow with one live run.
   const live = async () => {
      workflowId = (
         await WorkflowService.create(userId, {
            name: `Queue ${randomUUID().slice(0, 8)}`,
            goal: null,
            graph,
         })
      ).id

      return (await start())?.id ?? ''
   }

   it('should save a start while a run is live as queued, and start nothing for it', async () => {
      await live()

      const manual = await start('MANUAL')
      const api = await start('API')

      expect([manual?.status, api?.status]).toEqual(['QUEUED', 'QUEUED'])
      expect(
         await PrismaService.client.workflowRun.count({
            where: {
               workflowId,
               status: 'RUNNING',
            },
         })
      ).toBe(1)
   })

   it('should still refuse a preview, and a start by another workflow that waits for it, while a run is live', async () => {
      const first = await live()

      await expect(start('PREVIEW')).rejects.toThrow('still going')
      await expect(start('WORKFLOW', first)).rejects.toThrow('still going')
   })

   it('should queue at most the cap, and one scheduled run', async () => {
      await live()

      expect((await start('SCHEDULE'))?.status).toBe('QUEUED')
      await expect(start('SCHEDULE')).rejects.toThrow('already waiting')

      for (let queued = 1; queued < MAX_QUEUED; queued += 1) {
         expect((await start('API'))?.status).toBe('QUEUED')
      }

      await expect(start('API')).rejects.toThrow(`${MAX_QUEUED} runs are already waiting`)
   })

   it('should leave one live run and queue the other when two starts arrive at the same moment', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
         workflowId = (
            await WorkflowService.create(userId, {
               name: `Queue ${randomUUID().slice(0, 8)}`,
               goal: null,
               graph,
            })
         ).id

         const runs = await Promise.all([start('MANUAL'), start('API')])

         expect(runs.map(run => run?.status).sort()).toEqual(['QUEUED', 'RUNNING'])
      }
   })

   it('should start the oldest queued run when the live run ended, one at a time', async () => {
      const first = await live()
      const second = await start('MANUAL')
      const third = await start('API')

      expect(await WorkflowRunService.promoteWaiting()).toBe(0)
      expect(await statusOf(second?.id)).toBe('QUEUED')

      await PrismaService.client.workflowRun.update({
         where: { id: first },
         data: { status: 'SUCCEEDED' },
      })

      expect(await WorkflowRunService.promoteWaiting()).toBe(1)
      expect(await statusOf(second?.id)).toBe('RUNNING')
      expect(await statusOf(third?.id)).toBe('QUEUED')
      expect(await WorkflowRunService.promoteWaiting()).toBe(0)
   })

   it('should cancel a queued run when the owner stops it', async () => {
      await live()

      const queued = await start('MANUAL')

      expect(await WorkflowService.requestStop(userId, queued?.id ?? '')).toBe(true)
      expect(await PrismaService.client.workflowRun.findUnique({ where: { id: queued?.id } })).toMatchObject({
         status: 'STOPPED',
         finishedAt: expect.any(Date),
      })
      expect(await WorkflowService.requestStop(userId, queued?.id ?? '')).toBe(false)
   })
})
