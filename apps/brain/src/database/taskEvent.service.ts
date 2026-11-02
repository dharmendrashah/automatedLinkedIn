import { type Prisma } from 'generated/prisma/client'

import {
   type EventPhase,
   TASK_EVENT_DETAILS,
   type TaskEnvelope,
   originOfTrigger,
   originSchema,
   taskEnvelope,
} from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { readCatalog } from './taskCatalog'
import { detailsOf, importPending } from './taskEventDetails'

// A task event: one moment (before, on, after) of one task of one of the owner's accounts (.plan/workflow-events-and-hooks.md). The row
// holds ids and times only; the JSON is built from the session and the task's own rows when it is delivered or shown.

// An after event waits for the task's import this long, then goes without details and says so.
export const SETTLE_LIMIT_MS = 15 * 60 * 1000

export type EventSession = {
   id: string
   userId: string
   linkedInAccountId: string
   task: string | null
}

const sessionSelect = {
   id: true,
   userId: true,
   linkedInAccountId: true,
   task: true,
   taskVersion: true,
   trigger: true,
   origin: true,
   startedAt: true,
   runStartedAt: true,
   finishedAt: true,
   durationMs: true,
   status: true,
   verdict: true,
   message: true,
   report: true,
   requestParams: true,
   proxyServerId: true,
   proxyProtocol: true,
   proxyCountry: true,
   linkedInAccount: {
      select: {
         id: true,
         email: true,
         displayName: true,
      },
   },
} satisfies Prisma.SpiderSessionSelect

const inputOf = (params: unknown) =>
   params !== null && typeof params === 'object' && 'input' in params ? (params as { input: unknown }).input : undefined

export class TaskEventService {
   // Writes one event, and nothing for a task that needs no account (the catalog says so, never a list of names here). Runs in the
   // transaction the session is saved or ended in; a repeat of the same moment changes nothing.
   public static async record(
      tx: Prisma.TransactionClient,
      session: EventSession,
      phase: EventPhase,
      needsAccount: boolean
   ) {
      if (!needsAccount || !session.task) {
         return false
      }

      const { count } = await tx.taskEvent.createMany({
         data: [
            {
               userId: session.userId,
               sessionId: session.id,
               accountId: session.linkedInAccountId,
               task: session.task,
               phase,
               readyAt: new Date(),
            },
         ],
         skipDuplicates: true,
      })

      return count === 1
   }

   // The same, asking the catalog whether the task needs an account.
   public static async recordFor(tx: Prisma.TransactionClient, session: EventSession, phase: EventPhase) {
      const entry = (await readCatalog()).find(({ task }) => task === session.task)

      return this.record(tx, session, phase, entry?.needs.account === true)
   }

   // The worker began the run: the time is kept once, and the "on" event is written unless the task already ended.
   public static async began(sessionId: string, startedAt: Date) {
      return PrismaService.client.$transaction(async tx => {
         const session = await tx.spiderSession.findFirst({
            where: {
               id: sessionId,
               kind: 'TASK',
               status: 'IN_PROGRESS',
            },
            select: {
               id: true,
               userId: true,
               linkedInAccountId: true,
               task: true,
               runStartedAt: true,
            },
         })

         if (!session) {
            return false
         }

         if (!session.runStartedAt) {
            await tx.spiderSession.update({
               where: { id: sessionId },
               data: { runStartedAt: startedAt },
            })
         }

         return this.recordFor(tx, session, 'on')
      })
   }

   // Whether the event may go now: its data is stored, or it waited long enough.
   public static async settled(event: { phase: string; task: string; sessionId: string; at: Date }) {
      if (event.phase !== 'after') {
         return {
            ready: true,
            late: false,
         }
      }

      if (!(await importPending(event.task, event.sessionId))) {
         return {
            ready: true,
            late: false,
         }
      }

      const late = Date.now() - event.at.getTime() > SETTLE_LIMIT_MS

      return {
         ready: late,
         late,
      }
   }

   // The event as JSON. `withInput` adds the task's own input (the owner's settings, words and recipients), for the owner's own eyes
   // and the address the owner set; it is never stored with the event.
   public static async envelopeOf(
      eventId: string,
      options: { withInput?: boolean; late?: boolean } = {}
   ): Promise<TaskEnvelope | null> {
      const event = await PrismaService.client.taskEvent.findUnique({
         where: { id: eventId },
         select: {
            id: true,
            phase: true,
            task: true,
            at: true,
            session: { select: sessionSelect },
         },
      })

      if (!event || !event.session.task) {
         return null
      }

      const { session } = event
      const phase = event.phase as EventPhase
      const declared = event.task in TASK_EVENT_DETAILS
      const details = phase === 'after' && declared ? await detailsOf(event.task, session) : null
      const done = phase === 'after' && session.finishedAt !== null

      return taskEnvelope({
         id: event.id,
         phase,
         at: event.at,
         account: session.linkedInAccount,
         proxy: session.proxyServerId
            ? {
                 id: session.proxyServerId,
                 protocol: (session.proxyProtocol ?? 'HTTP').toLowerCase(),
                 country: session.proxyCountry,
              }
            : null,
         startedBy: originSchema.safeParse(session.origin).data ?? originOfTrigger(session.trigger),
         task: {
            name: session.task ?? event.task,
            version: session.taskVersion,
            sessionId: session.id,
         },
         ...(options.withInput && { input: inputOf(session.requestParams) }),
         requestedAt: session.startedAt,
         startedAt: session.runStartedAt ?? session.startedAt,
         finishedAt: session.finishedAt,
         durationMs: session.durationMs,
         result: done
            ? {
                 status: session.status,
                 verdict: session.verdict,
                 message: session.message,
                 report: session.report ?? undefined,
              }
            : null,
         details: details?.counts ?? null,
         detailsStatus: !declared ? 'none' : options.late ? 'late' : 'ready',
      })
   }

   // The newest event of the owner that a trigger would take (this moment, this task or any), for a preview or a run by hand.
   public static async latestId(userId: string, phase: string, task: string) {
      const event = await PrismaService.client.taskEvent.findFirst({
         where: {
            userId,
            phase,
            ...(task !== '' && { task }),
         },
         orderBy: { at: 'desc' },
         select: { id: true },
      })

      return event?.id ?? null
   }

   // The workflows that planned what an event is about, read from its items.
   public static async plannedBy(eventId: string) {
      return [
         ...new Set(
            (await TaskEventService.itemsOf(eventId)).flatMap(item => {
               const planned = item.facts?.['item.plannedBy']

               return typeof planned === 'string' ? [planned] : []
            })
         ),
      ]
   }

   // What the event is about, as items, for a run it starts. Nothing for a task with no details.
   public static async itemsOf(eventId: string) {
      const event = await PrismaService.client.taskEvent.findUnique({
         where: { id: eventId },
         select: {
            phase: true,
            task: true,
            session: {
               select: {
                  id: true,
                  userId: true,
                  linkedInAccountId: true,
                  startedAt: true,
               },
            },
         },
      })

      if (event?.phase !== 'after') {
         return []
      }

      return (await detailsOf(event.task, event.session))?.items ?? []
   }
}
