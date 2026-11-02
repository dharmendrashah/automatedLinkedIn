import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { ConflictError, EventToolsService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The owner looks at recent events, asks why one matches, and runs the workflow on it.

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

const graph = (task: string): Graph => ({
   nodes: [
      node('event', 'trigger.taskEvent', {
         phase: 'after',
         task,
      }),
      node('csv', 'output.csv'),
   ],
   edges: [
      {
         from: 'event',
         to: 'csv',
      },
   ],
})

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
let eventId: string

describe('event tools (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)

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
      await PrismaService.client.linkedInInvite.create({
         data: {
            userId,
            accountId: account.id,
            slug: 'bob',
            name: 'Bob',
            sessionId,
            state: 'SENT',
            noteSent: false,
            plannedAt: new Date(),
         },
      })
      eventId = (
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
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should list recent events and say which filter stops a trigger', async () => {
      const taking = await WorkflowService.create(userId, {
         name: `Take ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: graph('linkedin-invite'),
      })
      const other = await WorkflowService.create(userId, {
         name: `Other ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: graph('linkedin-reply'),
      })

      expect((await EventToolsService.recent(userId, taking.id))?.map(({ id }) => id)).toEqual([eventId])
      expect(await EventToolsService.recent(userId, other.id)).toEqual([])
      expect(await EventToolsService.check(userId, taking.id, eventId)).toEqual([
         {
            nodeId: 'event',
            name: 'When an account runs a task',
            ok: true,
            failed: [],
         },
      ])
      expect((await EventToolsService.check(userId, other.id, eventId))?.[0].failed).toEqual([
         {
            filter: 'task',
            expected: 'linkedin-reply',
            got: 'linkedin-invite',
         },
      ])
      expect(await EventToolsService.check(userId, taking.id, randomUUID())).toBeNull()
   })

   it('should run on a real event as a preview, replay once, and refuse an event the trigger does not take', async () => {
      const { id, outputListId } = await WorkflowService.create(userId, {
         name: `Replay ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: graph('linkedin-invite'),
      })
      const preview = await EventToolsService.runOn(userId, id, eventId, 'preview')

      expect(preview?.runId).toBeDefined()

      await advanceRun(preview?.runId ?? '', deps)

      expect((await WorkflowService.run(userId, preview?.runId ?? ''))?.trigger).toBe('PREVIEW')

      const replay = await EventToolsService.runOn(userId, id, eventId, 'replay')

      expect((await WorkflowService.run(userId, replay?.runId ?? ''))?.trigger).toBe('EVENT')
      await expect(EventToolsService.runOn(userId, id, eventId, 'replay')).rejects.toBeInstanceOf(ConflictError)
      expect(outputListId).toBeDefined()

      const mismatch = await WorkflowService.create(userId, {
         name: `Mismatch ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: graph('linkedin-reply'),
      })

      await expect(EventToolsService.runOn(userId, mismatch.id, eventId, 'replay')).rejects.toThrow(
         'This event does not match the trigger (task)'
      )
   })
})
