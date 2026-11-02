import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import {
   EventDispatchService,
   PrismaService,
   UserService,
   WalletService,
   WorkflowRunService,
   WorkflowService,
} from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. A task event starts a workflow, and the engine runs it from the event's items (.plan/workflow-events-and-hooks.md).

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

const graph: Graph = {
   nodes: [
      node('event', 'trigger.taskEvent', {
         phase: 'after',
         task: 'linkedin-invite',
      }),
      node('look', 'logic.ifEvent', {
         fact: 'item.noteSent',
         is: 'is',
         value: 'false',
      }),
      node('label', 'process.tag', { tags: ['invited without note'] }),
      node('list', 'output.list'),
   ],
   edges: [
      {
         from: 'event',
         to: 'look',
      },
      {
         from: 'look',
         to: 'label',
      },
      {
         from: 'label',
         to: 'list',
      },
   ],
}

const deps = {
   client: fakeDataClient(() => ({
      rows: [],
      costMicros: 0,
   })),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
}

let userId: string

describe('a workflow started by a task event (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should keep, from the invites of a finished run, only the people whose note did not go', async () => {
      const account = await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: 'ada@work.com',
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
         },
      })
      const sessionId = randomUUID()

      await PrismaService.client.spiderSession.create({
         data: {
            id: sessionId,
            userId,
            linkedInAccountId: account.id,
            kind: 'TASK',
            task: 'linkedin-invite',
            trigger: 'automatic',
            status: 'SUCCEEDED',
            requestParams: {},
         },
      })
      await PrismaService.client.taskEvent.create({
         data: {
            userId,
            sessionId,
            accountId: account.id,
            task: 'linkedin-invite',
            phase: 'after',
            readyAt: new Date(Date.now() - 5_000),
         },
      })

      const invite = (slug: string, noteSent: boolean) => ({
         userId,
         accountId: account.id,
         slug,
         name: slug,
         sessionId,
         state: 'SENT' as const,
         noteSent,
         plannedAt: new Date(),
      })

      const people = [invite('with-note', true), invite('without-note', false)]

      await PrismaService.client.linkedInInvite.createMany({ data: people })

      const { id: workflowId, outputListId } = await WorkflowService.create(userId, {
         name: `Notes ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph,
      })

      await WorkflowService.update(userId, workflowId, { enabled: true })
      await EventDispatchService.fanOut()
      await EventDispatchService.start(new Date(Date.now() + 1_000))

      const [run] = await PrismaService.client.workflowRun.findMany({ where: { workflowId } })

      expect(run.trigger).toBe('EVENT')

      await advanceRun(run.id, deps)

      const finished = await WorkflowService.run(userId, run.id)
      const members = await PrismaService.client.workflowListMember.findMany({ where: { listId: outputListId } })

      expect(finished?.status).toBe('SUCCEEDED')
      expect(members.map(({ slug }) => slug)).toEqual(['without-note'])
      expect(members[0].tags).toEqual(['invited without note'])
      expect((await WorkflowRunService.load(run.id))?.steps.find(step => step.nodeId === 'look')).toMatchObject({
         itemsIn: 2,
         itemsOut: 1,
      })
   })
})
