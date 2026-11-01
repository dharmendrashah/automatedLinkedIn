import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. Saving, switching off, deleting and starting a workflow (.plan/workflow-hardening-and-block-details.md).

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

const graphOf = (...more: GraphNode[]): Graph => ({
   nodes: [
      node('api', 'trigger.api'),
      node('people', 'input.profiles', { links: ['https://www.linkedin.com/in/ada'] }),
      node('csv', 'output.csv'),
      ...more,
   ],
   edges: [
      {
         from: 'api',
         to: 'people',
      },
      {
         from: 'people',
         to: 'csv',
      },
   ],
})

// A Task result with no block before it: an error that stops a workflow from running.
const broken = graphOf(node('result', 'logic.taskResult'))

let userId: string

const create = async (graph = graphOf()) =>
   WorkflowService.create(userId, {
      name: `Rules ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

describe('workflow save, switch off, delete and start (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should refuse a save made on an older copy, and accept one made on the current copy or with no copy', async () => {
      const { id, updatedAt } = await create()

      await WorkflowService.update(userId, id, { name: `Renamed ${randomUUID().slice(0, 8)}` })

      await expect(
         WorkflowService.update(userId, id, { graph: graphOf() }, { expectedUpdatedAt: updatedAt })
      ).rejects.toBeInstanceOf(ConflictError)

      const fresh = await WorkflowService.get(userId, id)

      await expect(
         WorkflowService.update(userId, id, { graph: graphOf() }, { expectedUpdatedAt: fresh?.updatedAt })
      ).resolves.toMatchObject({ switchedOff: null })
      await expect(
         WorkflowService.update(userId, id, { graph: graphOf() }, { expectedUpdatedAt: undefined })
      ).resolves.toBeTruthy()
   })

   it('should save a half-edited graph of a switched-on workflow and switch it off, saying why', async () => {
      const { id } = await create()

      await expect(WorkflowService.update(userId, id, { enabled: true })).resolves.toMatchObject({ enabled: true })

      const saved = await WorkflowService.update(userId, id, { graph: broken })

      expect(saved).toMatchObject({
         enabled: false,
         nextRunAt: null,
         switchedOff: expect.stringContaining('Task result'),
      })
      expect(JSON.stringify((await WorkflowService.get(userId, id))?.graph)).toContain('logic.taskResult')
   })

   it('should still refuse to switch a workflow on while it has a problem', async () => {
      const { id } = await create(broken)

      await expect(WorkflowService.update(userId, id, { enabled: true })).rejects.toBeInstanceOf(ConflictError)
      expect((await WorkflowService.get(userId, id))?.enabled).toBe(false)
   })

   it('should refuse to delete a workflow while a run is going, and delete it once the run ended', async () => {
      const { id } = await create()
      const run = await WorkflowService.startRun(userId, id, 'MANUAL', `rules-${randomUUID()}`)

      await expect(WorkflowService.delete(userId, id)).rejects.toThrow('Stop it first')
      expect(await WorkflowService.get(userId, id)).not.toBeNull()

      await PrismaService.client.workflowRun.update({
         where: { id: run?.id },
         data: { status: 'STOPPED' },
      })

      await expect(WorkflowService.delete(userId, id)).resolves.toBe(true)
   })

   it('should say when a waiting run goes on, instead of only that a run is going', async () => {
      const { id } = await create(
         graphOf(
            node('pause', 'logic.wait', {
               unit: 'days',
               amount: 2,
            })
         )
      )
      const run = await WorkflowService.startRun(userId, id, 'MANUAL', `rules-${randomUUID()}`)

      await expect(WorkflowService.startRun(userId, id, 'PREVIEW', `rules-${randomUUID()}`)).rejects.toThrow(
         'still going'
      )

      await PrismaService.client.workflowStepRun.updateMany({
         where: { runId: run?.id },
         data: { waitUntil: new Date(Date.now() + 2 * 86_400_000) },
      })

      await expect(WorkflowService.startRun(userId, id, 'PREVIEW', `rules-${randomUUID()}`)).rejects.toThrow(
         /waiting until \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/
      )
   })
})
