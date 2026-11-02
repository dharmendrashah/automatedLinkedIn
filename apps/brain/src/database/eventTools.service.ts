import { randomUUID } from 'node:crypto'

import {
   type EventMismatch,
   blockOf,
   eventTriggerOf,
   graphSchema,
   matchEvent,
   originOfTrigger,
   originSchema,
   upgradeGraph,
} from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { TaskEventService } from './taskEvent.service'
import { WorkflowService } from './workflow.service'

// What an owner does with the task events of a workflow's trigger: see the recent ones, ask why one did or did not start it, and run it on
// one (.plan/workflow-events-and-hooks.md). Every query is scoped by the owner.

const REPLAY_WINDOW_MS = 10 * 60 * 1000

export type TriggerCheck = { nodeId: string; name: string; ok: boolean; failed: EventMismatch[] }

const triggersOf = (graph: unknown) => {
   const parsed = graphSchema.safeParse(graph)

   return parsed.success
      ? upgradeGraph(parsed.data).nodes.flatMap(node => {
           const trigger = eventTriggerOf(node)

           return trigger
              ? [
                   {
                      nodeId: node.id,
                      name: node.label ?? blockOf(node.type).label,
                      trigger,
                   },
                ]
              : []
        })
      : []
}

export class EventToolsService {
   private static workflowOf(userId: string, workflowId: string) {
      return PrismaService.client.workflow.findFirst({
         where: {
            id: workflowId,
            userId,
         },
         select: {
            id: true,
            graph: true,
         },
      })
   }

   // The newest 50 events of the owner that the workflow's triggers would look at, each with what became of it for this workflow.
   // null when the workflow is not the owner's.
   public static async recent(userId: string, workflowId: string) {
      const workflow = await this.workflowOf(userId, workflowId)

      if (!workflow) {
         return null
      }

      const looks = triggersOf(workflow.graph).map(({ trigger }) => ({
         phase: trigger.phase,
         ...(trigger.task !== '' && { task: trigger.task }),
      }))

      if (looks.length === 0) {
         return []
      }

      const events = await PrismaService.client.taskEvent.findMany({
         where: {
            userId,
            readyAt: { not: null },
            OR: looks,
         },
         orderBy: [{ at: 'desc' }, { id: 'desc' }],
         take: 50,
         select: {
            id: true,
            task: true,
            phase: true,
            at: true,
            session: {
               select: {
                  origin: true,
                  trigger: true,
                  linkedInAccount: {
                     select: {
                        email: true,
                        displayName: true,
                     },
                  },
               },
            },
            deliveries: {
               where: { workflowId },
               select: {
                  status: true,
                  reason: true,
                  runId: true,
               },
            },
         },
      })

      return events.map(({ session, deliveries, ...event }) => ({
         ...event,
         account: session.linkedInAccount.displayName ?? session.linkedInAccount.email,
         startedBy: (originSchema.safeParse(session.origin).data ?? originOfTrigger(session.trigger)).kind,
         outcome: deliveries[0] ?? null,
      }))
   }

   // For each event trigger of the workflow: whether it would take this event, and the filters that said no.
   public static async check(userId: string, workflowId: string, eventId: string): Promise<TriggerCheck[] | null> {
      const workflow = await this.workflowOf(userId, workflowId)
      const event = await PrismaService.client.taskEvent.findFirst({
         where: {
            id: eventId,
            userId,
         },
         select: { id: true },
      })

      if (!workflow || !event) {
         return null
      }

      const envelope = await TaskEventService.envelopeOf(event.id)

      if (!envelope) {
         return null
      }

      const plannedByWorkflowIds = await TaskEventService.plannedBy(event.id)

      return triggersOf(workflow.graph).map(({ nodeId, name, trigger }) => ({
         nodeId,
         name,
         ...matchEvent(trigger, envelope, {
            workflowId,
            plannedByWorkflowIds,
         }),
      }))
   }

   // Runs the workflow on one real event: a preview (nothing is sent, nobody is added), or a replay, a real run that is refused when the
   // trigger would not take the event and starts at most once for an event and workflow in ten minutes. null when not the owner's.
   public static async runOn(userId: string, workflowId: string, eventId: string, mode: 'preview' | 'replay') {
      const checks = await this.check(userId, workflowId, eventId)

      if (!checks) {
         return null
      }

      const taking = checks.filter(({ ok }) => ok).map(({ nodeId }) => nodeId)

      if (mode === 'replay' && taking.length === 0) {
         const why = checks.flatMap(({ failed }) => failed.map(({ filter }) => filter))

         throw new ConflictError(
            why.length > 0
               ? `This event does not match the trigger (${[...new Set(why)].join(', ')}). Use a preview, or change the trigger.`
               : 'The workflow has no trigger that listens to events.'
         )
      }

      const window = Math.floor(Date.now() / REPLAY_WINDOW_MS)
      const run = await WorkflowService.startRun(
         userId,
         workflowId,
         mode === 'preview' ? 'PREVIEW' : 'EVENT',
         mode === 'preview' ? `event-preview:${randomUUID()}` : `event-replay:${eventId}:${workflowId}:${window}`,
         {
            input: {
               event: eventId,
               nodes: taking,
            },
         }
      )

      return run ? { runId: run.id } : null
   }

   // The event a run is about, when the owner started the run on it. null when it is not the owner's event.
   public static async ownEvent(eventId: string, userId: string) {
      const event = await PrismaService.client.taskEvent.findFirst({
         where: {
            id: eventId,
            userId,
         },
         select: { id: true },
      })

      return event?.id ?? null
   }
}
