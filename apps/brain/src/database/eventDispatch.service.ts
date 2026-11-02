import { Prisma } from 'generated/prisma/client'

import {
   type EventTrigger,
   type TaskEnvelope,
   eventTriggerOf,
   graphSchema,
   matchEvent,
   originOfTrigger,
   originSchema,
   upgradeGraph,
} from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { type JobItemInput } from './jobRun.service'
import { PrismaService } from './prisma.service'
import { TaskEventService } from './taskEvent.service'
import { MAX_CHAIN_DEPTH, WorkflowService } from './workflow.service'
import { WorkflowListenerService } from './workflowListener.service'

// Takes task events to the workflows that listen to them, in two phases that each can run again safely (.plan/workflow-events-and-hooks.md):
// fan out (an event becomes one delivery per listening workflow) and start (a delivery becomes a run, or waits for its turn).

export const DISPATCH = {
   eventsPerTick: 200,
   perOwnerPerTick: 20,
   startsPerTick: 200,
   leaseSeconds: 60,
   poisonAfter: 5,
   waitHours: 6,
   // Event runs that may wait in a workflow's queue, so scheduled and API runs still find room.
   queuedPerWorkflow: 3,
   maxBackoffMs: 10 * 60 * 1000,
} as const

const HOUR_MS = 60 * 60 * 1000

export const REASONS = {
   tooDeep: `Workflows can start each other at most ${MAX_CHAIN_DEPTH} in a row.`,
   off: 'The workflow was switched off.',
   tooOld: 'Waited too long for its turn.',
   deleted: 'The workflow no longer exists.',
} as const

type ClaimedEvent = {
   id: string
   userId: string
   task: string
   phase: string
   sessionId: string
   at: Date
   attempts: number
}

export type DeliveryTargets = { nodes: string[]; depth: number; account: string | null }

const targetsOf = (value: unknown): DeliveryTargets => {
   const read = value as Partial<DeliveryTargets> | null

   return {
      nodes: Array.isArray(read?.nodes) ? read.nodes.filter((id): id is string => typeof id === 'string') : [],
      depth: typeof read?.depth === 'number' ? read.depth : 0,
      account: typeof read?.account === 'string' ? read.account : null,
   }
}

const backoffMs = (attempts: number) => Math.min(DISPATCH.maxBackoffMs, 30_000 * 2 ** Math.max(0, attempts - 1))

export class EventDispatchService {
   // Claims ready events for a minute so two workers never take the same one, at most 20 an owner. The database clock decides.
   private static claim(): Promise<ClaimedEvent[]> {
      return PrismaService.client.$queryRaw<ClaimedEvent[]>(Prisma.sql`
         WITH due AS (
            SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "at") AS n
            FROM "TaskEvent"
            WHERE "dispatchedAt" IS NULL
              AND "readyAt" <= timezone('UTC', now())
              AND ("claimedUntil" IS NULL OR "claimedUntil" < timezone('UTC', now()))
         ), picked AS (
            SELECT t."id" FROM "TaskEvent" t JOIN due ON due."id" = t."id"
            WHERE due.n <= ${DISPATCH.perOwnerPerTick}
            ORDER BY t."at"
            LIMIT ${DISPATCH.eventsPerTick}
            FOR UPDATE OF t SKIP LOCKED
         )
         UPDATE "TaskEvent" SET "claimedUntil" = timezone('UTC', now()) + ${DISPATCH.leaseSeconds} * interval '1 second'
         WHERE "id" IN (SELECT "id" FROM picked)
         RETURNING "id", "userId", "task", "phase", "sessionId", "at", "attempts"
      `)
   }

   // The trigger blocks of one workflow that want this event, read from the saved graph.
   private static async matching(
      workflowId: string,
      nodeIds: string[],
      envelope: TaskEnvelope,
      plannedBy: string[]
   ): Promise<{ nodes: string[]; trigger: EventTrigger | null }> {
      const workflow = await PrismaService.client.workflow.findUnique({
         where: { id: workflowId },
         select: { graph: true },
      })
      const parsed = graphSchema.safeParse(workflow?.graph)

      if (!parsed.success) {
         return {
            nodes: [],
            trigger: null,
         }
      }

      const graph = upgradeGraph(parsed.data)
      const wanted = graph.nodes.flatMap(node => {
         const trigger = nodeIds.includes(node.id) ? eventTriggerOf(node) : null

         return trigger &&
            matchEvent(trigger, envelope, {
               workflowId,
               plannedByWorkflowIds: plannedBy,
            }).ok
            ? [
                 {
                    id: node.id,
                    trigger,
                 },
              ]
            : []
      })

      return {
         nodes: wanted.map(({ id }) => id),
         trigger: wanted[0]?.trigger ?? null,
      }
   }

   private static async depthOf(envelope: TaskEnvelope) {
      const runId = originSchema.safeParse(envelope.startedBy).data?.runId

      if (!runId) {
         return 0
      }

      const run = await PrismaService.client.workflowRun.findUnique({
         where: { id: runId },
         select: { depth: true },
      })

      return (run?.depth ?? 0) + 1
   }

   // Phase one for one event. Writes its deliveries and marks it dispatched in one transaction.
   private static async fanOutOne(event: ClaimedEvent, now: Date): Promise<number> {
      const settled = await TaskEventService.settled(event)

      if (!settled.ready) {
         await PrismaService.client.taskEvent.update({
            where: { id: event.id },
            data: { claimedUntil: null },
         })

         return 0
      }

      const listeners = await WorkflowListenerService.listening(event.userId, event.phase, event.task)
      const envelope = listeners.length > 0 ? await TaskEventService.envelopeOf(event.id, { late: settled.late }) : null
      const byWorkflow = new Map<string, string[]>()

      for (const { workflowId, nodeId } of listeners) {
         byWorkflow.set(workflowId, [...(byWorkflow.get(workflowId) ?? []), nodeId])
      }

      const rows: Prisma.WorkflowDeliveryCreateManyInput[] = []

      if (envelope) {
         const plannedBy = [
            ...new Set(
               (await TaskEventService.itemsOf(event.id)).flatMap(item => {
                  const planned = item.facts?.['item.plannedBy']

                  return typeof planned === 'string' ? [planned] : []
               })
            ),
         ]
         const depth = await this.depthOf(envelope)

         for (const [workflowId, nodeIds] of byWorkflow) {
            const { nodes } = await this.matching(workflowId, nodeIds, envelope, plannedBy)

            if (nodes.length > 0) {
               rows.push({
                  userId: event.userId,
                  workflowId,
                  taskEventId: event.id,
                  phase: event.phase,
                  targets: {
                     nodes,
                     depth,
                     account: envelope.account?.id ?? null,
                  } satisfies DeliveryTargets,
                  retryAt: now,
                  createdAt: now,
                  ...(depth > MAX_CHAIN_DEPTH && {
                     status: 'SKIPPED',
                     reason: REASONS.tooDeep,
                  }),
               })
            }
         }
      }

      await PrismaService.client.$transaction([
         PrismaService.client.workflowDelivery.createMany({
            data: rows,
            skipDuplicates: true,
         }),
         PrismaService.client.taskEvent.update({
            where: { id: event.id },
            data: {
               dispatchedAt: now,
               claimedUntil: null,
            },
         }),
      ])

      return rows.length
   }

   // Phase one: every ready event becomes deliveries. A poison event is parked after a few failed tries.
   public static async fanOut(now = new Date()) {
      const events = await this.claim()
      const items: JobItemInput[] = []
      let deliveries = 0

      for (const event of events) {
         try {
            const made = await this.fanOutOne(event, now)

            deliveries += made

            if (made > 0) {
               items.push({
                  userId: event.userId,
                  action: 'task-event',
                  result: 'ASKED',
                  sessionId: event.sessionId,
               })
            }
         } catch (error) {
            const parked = event.attempts + 1 >= DISPATCH.poisonAfter

            await PrismaService.client.taskEvent.update({
               where: { id: event.id },
               data: {
                  attempts: { increment: 1 },
                  lastError: (error as Error).name,
                  claimedUntil: null,
                  ...(parked && { dispatchedAt: now }),
               },
            })
            items.push({
               userId: event.userId,
               action: 'task-event',
               result: 'FAILED',
               reason: 'The event could not be built.',
               sessionId: event.sessionId,
            })
         }
      }

      return {
         events: events.length,
         deliveries,
         items,
      }
   }

   private static async settle(
      id: string,
      change: { status: 'STARTED' | 'SKIPPED' | 'DROPPED'; reason?: string; runId?: string },
      now: Date
   ) {
      await PrismaService.client.workflowDelivery.update({
         where: { id },
         data: {
            status: change.status,
            reason: change.reason ?? null,
            ...(change.runId && { runId: change.runId }),
            ...(change.status === 'STARTED' && { startedAt: now }),
         },
      })
   }

   private static async wait(id: string, attempts: number, reason: string, now: Date) {
      await PrismaService.client.workflowDelivery.update({
         where: { id },
         data: {
            attempts: attempts + 1,
            reason,
            retryAt: new Date(now.getTime() + backoffMs(attempts + 1)),
         },
      })
   }

   // Whether the workflow already started as many event runs this hour as its trigger allows.
   private static async overLimit(workflowId: string, graph: unknown, nodes: string[], now: Date) {
      const parsed = graphSchema.safeParse(graph)
      const limits = parsed.success
         ? upgradeGraph(parsed.data).nodes.flatMap(node => {
              const trigger = nodes.includes(node.id) ? eventTriggerOf(node) : null

              return trigger ? [trigger.maxPerHour] : []
           })
         : []
      const limit = Math.max(1, ...limits)
      const started = await PrismaService.client.workflowDelivery.count({
         where: {
            workflowId,
            source: 'TASK',
            status: 'STARTED',
            startedAt: { gt: new Date(now.getTime() - HOUR_MS) },
         },
      })

      return started >= limit
   }

   // Phase two: PENDING deliveries whose turn has come, oldest first, a few for each owner.
   public static async start(now = new Date()) {
      const due = await PrismaService.client.workflowDelivery.findMany({
         where: {
            source: 'TASK',
            status: 'PENDING',
            retryAt: { lte: now },
         },
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
         take: DISPATCH.startsPerTick,
         select: {
            id: true,
            userId: true,
            workflowId: true,
            taskEventId: true,
            targets: true,
            attempts: true,
            createdAt: true,
            workflow: {
               select: {
                  enabled: true,
                  graph: true,
               },
            },
            taskEvent: { select: { sessionId: true } },
         },
      })
      const perOwner = new Map<string, number>()
      const items: JobItemInput[] = []
      let started = 0

      for (const delivery of due) {
         const taken = perOwner.get(delivery.userId) ?? 0

         if (taken >= DISPATCH.perOwnerPerTick) {
            continue
         }

         perOwner.set(delivery.userId, taken + 1)

         const item = (result: 'ASKED' | 'SKIPPED', reason?: string): JobItemInput => ({
            userId: delivery.userId,
            action: 'event-run',
            result,
            ...(reason && { reason }),
            sessionId: delivery.taskEvent?.sessionId,
         })

         if (!delivery.workflow.enabled) {
            await this.settle(
               delivery.id,
               {
                  status: 'SKIPPED',
                  reason: REASONS.off,
               },
               now
            )
            items.push(item('SKIPPED', REASONS.off))
            continue
         }

         if (now.getTime() - delivery.createdAt.getTime() > DISPATCH.waitHours * HOUR_MS) {
            await this.settle(
               delivery.id,
               {
                  status: 'DROPPED',
                  reason: REASONS.tooOld,
               },
               now
            )
            items.push(item('SKIPPED', REASONS.tooOld))
            continue
         }

         const targets = targetsOf(delivery.targets)

         if (await this.overLimit(delivery.workflowId, delivery.workflow.graph, targets.nodes, now)) {
            await this.wait(delivery.id, delivery.attempts, 'The hourly limit of this trigger is reached.', now)
            continue
         }

         const queued = await PrismaService.client.workflowRun.count({
            where: {
               workflowId: delivery.workflowId,
               status: 'QUEUED',
               trigger: 'EVENT',
            },
         })

         if (queued >= DISPATCH.queuedPerWorkflow) {
            await this.wait(delivery.id, delivery.attempts, 'The workflow is busy with other event runs.', now)
            continue
         }

         try {
            const run = await WorkflowService.startRun(
               delivery.userId,
               delivery.workflowId,
               'EVENT',
               `taskEvent:${delivery.taskEventId}:${delivery.workflowId}`,
               {
                  input: {
                     delivery: delivery.id,
                     nodes: targets.nodes,
                     account: targets.account,
                  },
                  depth: targets.depth,
               }
            )

            if (!run) {
               await this.settle(
                  delivery.id,
                  {
                     status: 'SKIPPED',
                     reason: REASONS.deleted,
                  },
                  now
               )
               continue
            }

            await this.settle(
               delivery.id,
               {
                  status: 'STARTED',
                  runId: run.id,
               },
               now
            )
            items.push(item('ASKED'))
            started += 1
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }

            if (error.message.startsWith('Fix the workflow first')) {
               await this.settle(
                  delivery.id,
                  {
                     status: 'SKIPPED',
                     reason: error.message,
                  },
                  now
               )
               items.push(item('SKIPPED', error.message))
            } else if (error.message === 'This run has already started.') {
               const run = await PrismaService.client.workflowRun.findUnique({
                  where: { runKey: `taskEvent:${delivery.taskEventId}:${delivery.workflowId}` },
                  select: { id: true },
               })

               await this.settle(
                  delivery.id,
                  {
                     status: 'STARTED',
                     ...(run && { runId: run.id }),
                  },
                  now
               )
            } else {
               await this.wait(delivery.id, delivery.attempts, error.message, now)
            }
         }
      }

      return {
         started,
         items,
      }
   }

   // What happened to the events a workflow listens to: whether it is listening, the last day in counts, and the newest deliveries
   // with their fixed reasons. null when the workflow is not the owner's.
   public static async activity(userId: string, workflowId: string) {
      const workflow = await PrismaService.client.workflow.findFirst({
         where: {
            id: workflowId,
            userId,
         },
         select: { enabled: true },
      })

      if (!workflow) {
         return null
      }

      const since = new Date(Date.now() - 24 * HOUR_MS)
      const [counts, recent] = await Promise.all([
         PrismaService.client.workflowDelivery.groupBy({
            by: ['status'],
            where: {
               workflowId,
               source: 'TASK',
               createdAt: { gt: since },
            },
            _count: { _all: true },
         }),
         PrismaService.client.workflowDelivery.findMany({
            where: {
               workflowId,
               source: 'TASK',
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 50,
            select: {
               id: true,
               status: true,
               reason: true,
               runId: true,
               createdAt: true,
               taskEvent: {
                  select: {
                     id: true,
                     task: true,
                     phase: true,
                     session: {
                        select: {
                           trigger: true,
                           origin: true,
                           linkedInAccount: {
                              select: {
                                 email: true,
                                 displayName: true,
                              },
                           },
                        },
                     },
                  },
               },
            },
         }),
      ])

      return {
         listening: workflow.enabled,
         last24Hours: Object.fromEntries(counts.map(({ status, _count }) => [status, _count._all])),
         recent: recent.flatMap(({ taskEvent, ...delivery }) =>
            taskEvent
               ? [
                    {
                       ...delivery,
                       eventId: taskEvent.id,
                       task: taskEvent.task,
                       phase: taskEvent.phase,
                       account:
                          taskEvent.session.linkedInAccount.displayName ?? taskEvent.session.linkedInAccount.email,
                       startedBy: (
                          originSchema.safeParse(taskEvent.session.origin).data ??
                          originOfTrigger(taskEvent.session.trigger)
                       ).kind,
                    },
                 ]
               : []
         ),
      }
   }

   // The event a delivery is about, for the run it started.
   public static async eventOfDelivery(deliveryId: string, userId: string) {
      const delivery = await PrismaService.client.workflowDelivery.findFirst({
         where: {
            id: deliveryId,
            userId,
         },
         select: { taskEventId: true },
      })

      return delivery?.taskEventId ?? null
   }
}
