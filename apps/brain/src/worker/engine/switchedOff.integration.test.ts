import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowRunService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. A block that is switched off passes everything on without running (.plan/workflow-engine-p5-editor.md).

const email = `${randomUUID()}@elitale.com`
const ADA = 'https://www.linkedin.com/in/ada-lovelace'
const ALAN = 'https://www.linkedin.com/in/alan-turing'

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}, off = false): GraphNode => ({
   id,
   type,
   config,
   ...(off ? { disabled: true } : {}),
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
const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Off ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const started = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `off-${randomUUID()}`)
   const runId = started?.id ?? ''
   const client = fakeDataClient(() => ({
      rows: [],
      costMicros: 1_000,
   }))

   for (let round = 0; round < 3; round += 1) {
      await advanceRun(runId, {
         client,
         signal: new AbortController().signal,
         log: {
            info: () => undefined,
            error: () => undefined,
         },
      })
   }

   const steps = Object.fromEntries(
      (await PrismaService.client.workflowStepRun.findMany({ where: { runId } })).map(step => [step.nodeId, step])
   )

   return {
      runId,
      listId: workflow.outputListId,
      client,
      steps,
      status: (await WorkflowService.run(userId, runId))?.status,
   }
}

describe('a block that is switched off (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should pass what reaches it on, with no request and no cost', async () => {
      const { runId, client, steps, status } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA, ALAN] }),
            node('who', 'collect.searchPeople', { keywords: 'sales' }, true),
            node('file', 'output.csv'),
         ],
         edges: [line('begin', 'people'), line('people', 'who'), line('who', 'file')],
      })

      expect(client.start).not.toHaveBeenCalled()
      expect(steps.who).toMatchObject({
         status: 'DONE',
         itemsIn: 2,
         itemsOut: 2,
         costMicros: 0,
         message: expect.stringContaining('switched off'),
      })
      expect(steps.file).toMatchObject({
         status: 'DONE',
         itemsOut: 2,
      })
      expect(status).toBe('SUCCEEDED')
      expect(
         (
            await PrismaService.client.workflowItem.findMany({
               where: {
                  runId,
                  nodeId: 'file',
               },
            })
         )
            .map(({ slug }) => slug)
            .sort()
      ).toEqual(['ada-lovelace', 'alan-turing'])
   })

   it('should not count what an off list or an off Give back would have kept', async () => {
      const { runId, listId } = await run({
         nodes: [
            node('begin', 'trigger.manual'),
            node('people', 'input.profiles', { links: [ADA] }),
            node('list', 'output.list', {}, true),
            node('back', 'output.return', {}, true),
         ],
         edges: [line('begin', 'people'), line('people', 'list'), line('people', 'back')],
      })

      expect(await WorkflowRunService.listedPeople(runId)).toEqual([])
      expect(await WorkflowRunService.returned(runId)).toBeNull()
      expect(await PrismaService.client.workflowListMember.count({ where: { listId } })).toBe(0)
   })
})
