import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type Graph, type GraphNode, type Origin, type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { EventDispatchService } from './eventDispatch.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskEventService } from './taskEvent.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'
import { WorkflowListenerService } from './workflowListener.service'

// Needs PostgreSQL. The broker is replaced: only what brain writes to the database is under test (.plan/workflow-events-and-hooks.md).
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock('core', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('core')),
   TaskQueue: { publish: mocks.publish },
}))

const TASK = `it-event-${randomUUID().slice(0, 8)}`
const emails = [`${randomUUID()}@elitale.com`, `${randomUUID()}@elitale.com`]

const entry: TaskCatalogEntry = {
   contract: 1,
   task: TASK,
   version: 1,
   title: 'Event task',
   description: 'Only for this test.',
   input_schema: { type: 'object' },
   needs: {
      proxy: 'none',
      account: true,
   },
   verdicts: {
      DONE: {
         label: 'Done',
         tone: 'success',
      },
   },
   policy: {
      cooldown_ms: 0,
      one_at_a_time: 'account',
      automatic: [],
   },
   hosts: ['example.com'],
}

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const listening = (config: GraphNode['config']): Graph => ({
   nodes: [
      node('event', 'trigger.taskEvent', {
         task: TASK,
         ...config,
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

let owner: string
let other: string
let accountId: string

const listener = async (userId: string, config: GraphNode['config'] = {}) => {
   const { id } = await WorkflowService.create(userId, {
      name: `Listens ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph: listening(config),
   })

   await WorkflowService.update(userId, id, { enabled: true })

   return id
}

// Asks the task and answers it, as the spider would.
const runTask = async (origin?: Origin) => {
   const { id } = await TaskService.request({
      userId: owner,
      task: TASK,
      accountId,
      trigger: 'automatic',
      ...(origin && { origin }),
   })
   const session = await PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })
   const result = {
      contract: 1 as const,
      task_id: id,
      task: TASK,
      task_version: 1,
      status: 'SUCCEEDED' as const,
      verdict: 'DONE',
      message: 'Done.',
      artifacts: [],
      artifacts_truncated: false,
      worker: { build: 'abc1234' },
      started_at: session.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
   }

   await TaskService.applyResult(result)
   await TaskService.applyResult(result)

   return id
}

const dispatch = async () => {
   // Rows are dated by this process and the claim reads the database clock, which can lag a little.
   await PrismaService.client.taskEvent.updateMany({ data: { readyAt: new Date(Date.now() - 5_000) } })

   const fanned = await EventDispatchService.fanOut()
   const started = await EventDispatchService.start(new Date(Date.now() + 1_000))

   return {
      fanned,
      started,
   }
}

const runsOf = (workflowId: string) => PrismaService.client.workflowRun.findMany({ where: { workflowId } })

describe('task events (database)', () => {
   beforeAll(async () => {
      owner = (await UserService.create({ email: emails[0] })).id
      other = (await UserService.create({ email: emails[1] })).id
      await WalletService.save(50_000_000)

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId: owner,
               email: 'ada@work.com',
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
      mocks.publish.mockResolvedValue(undefined)
      await TaskService.applyCatalog({
         contract: 1,
         announced_at: new Date().toISOString(),
         worker: { build: 'abc1234' },
         tasks: [entry],
      })
   })

   afterAll(async () => {
      await PrismaService.client.taskDefinition.deleteMany({ where: { task: TASK } })
      await PrismaService.client.user.deleteMany({ where: { email: { in: emails } } })
      await PrismaService.disconnect()
   })

   it('should keep when the worker began once and write the on event once, and drop one after the result', async () => {
      const { id } = await TaskService.request({
         userId: owner,
         task: TASK,
         accountId,
         trigger: 'automatic',
      })

      await expect(TaskEventService.began(id, new Date('2026-01-01T00:00:05Z'))).resolves.toBe(true)
      await expect(TaskEventService.began(id, new Date('2026-01-01T00:00:09Z'))).resolves.toBe(false)

      const session = await PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })

      expect(session.runStartedAt?.toISOString()).toBe('2026-01-01T00:00:05.000Z')

      await TaskService.applyResult({
         contract: 1,
         task_id: id,
         task: TASK,
         task_version: 1,
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Done.',
         artifacts: [],
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: session.startedAt.toISOString(),
         finished_at: new Date().toISOString(),
      })

      await expect(TaskEventService.began(id, new Date())).resolves.toBe(false)
      expect(
         await PrismaService.client.taskEvent.count({
            where: {
               sessionId: id,
               phase: 'on',
            },
         })
      ).toBe(1)
   })

   it('should say whether the note went with each invite, and who planned it, in the items of the event', async () => {
      const sessionId = randomUUID()

      await PrismaService.client.spiderSession.create({
         data: {
            id: sessionId,
            userId: owner,
            linkedInAccountId: accountId,
            kind: 'TASK',
            task: 'linkedin-invite',
            requestParams: {},
         },
      })

      const { id: eventId } = await PrismaService.client.taskEvent.create({
         data: {
            userId: owner,
            sessionId,
            accountId,
            task: 'linkedin-invite',
            phase: 'after',
         },
      })
      const invite = (slug: string, state: 'SENT' | 'FAILED', noteSent: boolean | null) => ({
         userId: owner,
         accountId,
         slug,
         name: slug,
         sessionId,
         state,
         noteSent,
         plannedAt: new Date(),
         originWorkflowId: 'w-campaign',
      })

      const invites = [
         invite('with-note', 'SENT', true),
         invite('no-note', 'SENT', false),
         invite('failed', 'FAILED', null),
      ]

      await PrismaService.client.linkedInInvite.createMany({ data: invites })

      const items = await TaskEventService.itemsOf(eventId)
      const outcomes = Object.fromEntries(items.map(item => [item.slug, item.facts]))
      const envelope = await TaskEventService.envelopeOf(eventId)

      expect(outcomes).toEqual({
         'with-note': {
            'item.outcome': 'SENT',
            'item.noteSent': true,
            'item.plannedBy': 'w-campaign',
         },
         'no-note': {
            'item.outcome': 'SENT_WITHOUT_NOTE',
            'item.noteSent': false,
            'item.plannedBy': 'w-campaign',
         },
         failed: {
            'item.outcome': 'NOT_SENT',
            'item.noteSent': null,
            'item.plannedBy': 'w-campaign',
         },
      })
      // The JSON holds counts only: no names.
      expect(envelope?.task.details).toEqual({
         SENT: 1,
         SENT_WITHOUT_NOTE: 1,
         NOT_SENT: 1,
      })
      expect(JSON.stringify(envelope)).not.toContain('no-note')
   })

   it('should give no arrivals for the first read of an account', async () => {
      const sessionId = randomUUID()

      await PrismaService.client.spiderSession.create({
         data: {
            id: sessionId,
            userId: owner,
            linkedInAccountId: accountId,
            kind: 'TASK',
            task: 'linkedin-messages',
            requestParams: {},
         },
      })

      const { id: eventId } = await PrismaService.client.taskEvent.create({
         data: {
            userId: owner,
            sessionId,
            accountId,
            task: 'linkedin-messages',
            phase: 'after',
         },
      })

      expect(await TaskEventService.itemsOf(eventId)).toEqual([])
   })

   it('should keep a listener row for each trigger of a switched-on workflow, and none once it is off', async () => {
      const id = await listener(owner, {
         phase: 'before',
         task: TASK,
      })
      const rows = () => PrismaService.client.workflowListener.findMany({ where: { workflowId: id } })

      expect(await rows()).toMatchObject([
         {
            nodeId: 'event',
            phase: 'before',
            task: TASK,
            userId: owner,
         },
      ])

      await WorkflowService.update(owner, id, { enabled: false })

      expect(await rows()).toEqual([])
   })

   it('should rebuild the listener rows from the graphs when one write missed them', async () => {
      const id = await listener(owner, { phase: 'after' })

      await PrismaService.client.workflowListener.deleteMany({ where: { workflowId: id } })

      expect(await WorkflowListenerService.repair()).toBeGreaterThanOrEqual(1)
      expect(await PrismaService.client.workflowListener.count({ where: { workflowId: id } })).toBe(1)
   })

   it('should write before when the task is asked and after once, even when the result is delivered twice', async () => {
      const sessionId = await runTask()
      const events = await PrismaService.client.taskEvent.findMany({
         where: { sessionId },
         orderBy: { at: 'asc' },
      })

      expect(events.map(({ phase }) => phase).sort()).toEqual(['after', 'before'])
      expect(events.every(({ userId }) => userId === owner)).toBe(true)
   })

   it('should start one run for each of the owner workflows that listen, and none for another owner', async () => {
      const mine = await listener(owner, { phase: 'after' })
      const theirs = await listener(other, { phase: 'after' })

      await runTask()

      const { started } = await dispatch()
      const [run] = await runsOf(mine)
      const [delivery] = await PrismaService.client.workflowDelivery.findMany({ where: { workflowId: mine } })

      expect(started.started).toBeGreaterThanOrEqual(1)
      expect(run).toMatchObject({
         trigger: 'EVENT',
         input: {
            delivery: delivery.id,
            nodes: ['event'],
         },
      })
      expect(delivery).toMatchObject({
         status: 'STARTED',
         runId: run.id,
      })
      expect(await runsOf(theirs)).toEqual([])
   })

   it('should not start a workflow for a task it started itself, unless it says so', async () => {
      const plain = await listener(owner, { phase: 'after' })
      const own = await listener(owner, {
         phase: 'after',
         ownTasks: true,
      })

      await runTask({
         kind: 'workflow',
         workflowId: plain,
      })
      await dispatch()

      expect(await runsOf(plain)).toEqual([])
      expect(await runsOf(own)).toHaveLength(1)
   })

   it('should keep an event waiting when the trigger reached its hourly limit', async () => {
      const limited = await listener(owner, {
         phase: 'after',
         maxPerHour: 1,
      })

      await runTask()
      await dispatch()
      await runTask()
      await dispatch()

      const deliveries = await PrismaService.client.workflowDelivery.findMany({
         where: { workflowId: limited },
         orderBy: { createdAt: 'asc' },
      })

      expect(deliveries.map(({ status }) => status)).toEqual(['STARTED', 'PENDING'])
      expect(deliveries[1].reason).toContain('hourly limit')
   })

   it('should let only one claiming workflow take an event, and leave the others that did not ask to claim', async () => {
      const first = await listener(owner, {
         phase: 'after',
         claim: true,
      })
      const second = await listener(owner, {
         phase: 'after',
         claim: true,
      })
      const free = await listener(owner, { phase: 'after' })

      await runTask()
      await dispatch()

      const statusOf = async (workflowId: string) =>
         (await PrismaService.client.workflowDelivery.findFirstOrThrow({ where: { workflowId } })).status

      const taken = [await statusOf(first), await statusOf(second)].sort()

      expect(taken).toEqual(['SKIPPED', 'STARTED'])
      expect(await statusOf(free)).toBe('STARTED')
   })

   it('should hold events for the window of a collecting trigger, then start one run for all of them', async () => {
      const batch = await listener(owner, {
         phase: 'after',
         batchMinutes: 5,
      })

      await runTask()
      await runTask()
      await PrismaService.client.taskEvent.updateMany({ data: { readyAt: new Date(Date.now() - 5_000) } })
      await EventDispatchService.fanOut()

      await EventDispatchService.start(new Date(Date.now() + 1_000))

      expect(await runsOf(batch)).toEqual([])

      await EventDispatchService.start(new Date(Date.now() + 6 * 60_000))

      const runs = await runsOf(batch)
      const deliveries = await PrismaService.client.workflowDelivery.findMany({ where: { workflowId: batch } })

      expect(runs).toHaveLength(1)
      expect(deliveries.map(({ status, runId }) => [status, runId])).toEqual([
         ['STARTED', runs[0].id],
         ['STARTED', runs[0].id],
      ])
      expect((runs[0].input as { deliveries: string[] }).deliveries).toHaveLength(2)
   })
})
