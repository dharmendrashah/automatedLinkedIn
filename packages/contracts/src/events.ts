import { z } from 'zod'

import { MOODS } from './mood'

// Events: something that happened, as one small JSON, and how a workflow matches it (.plan/workflow-events-and-hooks.md).
// The JSON carries counts, ids and fixed facts; other people's names and words travel as items, never in it.

export const EVENT_PHASES = ['before', 'on', 'after'] as const

export type EventPhase = (typeof EVENT_PHASES)[number]

export const isEventPhase = (value: unknown): value is EventPhase =>
   typeof value === 'string' && (EVENT_PHASES as readonly string[]).includes(value)

export const ORIGIN_KINDS = ['owner', 'automation', 'workflow', 'retry', 'event'] as const

// Who asked for a task or an act: ids only.
export const originSchema = z.object({
   kind: z.enum(ORIGIN_KINDS),
   job: z.string().max(60).optional(),
   workflowId: z.string().max(60).optional(),
   runId: z.string().max(60).optional(),
   nodeId: z.string().max(60).optional(),
   eventId: z.string().max(60).optional(),
})

export type Origin = z.infer<typeof originSchema>

// What a session asked in the old way (`manual`, `automatic`, `retry`) says about its origin.
export const originOfTrigger = (trigger: string | null | undefined, job?: string): Origin => {
   if (trigger === 'manual') {
      return { kind: 'owner' }
   }

   if (trigger === 'retry') {
      return { kind: 'retry' }
   }

   return job
      ? {
           kind: 'automation',
           job,
        }
      : { kind: 'automation' }
}

export type EventAccount = { id: string; email: string; displayName: string | null }
export type EventProxy = { id: string; protocol: string; country: string | null }

export type EventCore = {
   version: 1
   kind: 'task'
   phase: EventPhase
   id: string
   at: string
   account: EventAccount | null
   proxy: EventProxy | null
   startedBy: Origin
}

export type TaskResultFacts = {
   status: string
   verdict: string | null
   message: string | null
   report?: unknown
}

export type TaskEnvelope = EventCore & {
   task: {
      name: string
      version: number | null
      sessionId: string
      input?: unknown
      requestedAt: string
      startedAt?: string | null
      finishedAt?: string | null
      durationMs?: number | null
      result?: TaskResultFacts | null
      details?: Record<string, unknown> | null
      detailsStatus?: 'ready' | 'late' | 'none'
   }
}

export type TaskEnvelopeInput = {
   id: string
   phase: EventPhase
   at: Date
   account: EventAccount | null
   proxy: EventProxy | null
   startedBy: Origin
   task: { name: string; version: number | null; sessionId: string }
   input?: unknown
   requestedAt: Date
   startedAt: Date | null
   finishedAt: Date | null
   durationMs: number | null
   result: TaskResultFacts | null
   details: Record<string, unknown> | null
   detailsStatus: 'ready' | 'late' | 'none'
}

const iso = (date: Date | null) => (date ? date.toISOString() : null)

// The part every event shares.
export const envelopeCore = (input: TaskEnvelopeInput): EventCore => ({
   version: 1,
   kind: 'task',
   phase: input.phase,
   id: input.id,
   at: input.at.toISOString(),
   account: input.account,
   proxy: input.proxy,
   startedBy: input.startedBy,
})

// Before has no times and no result, on adds when the worker began, after has everything.
export const taskEnvelope = (input: TaskEnvelopeInput): TaskEnvelope => {
   const base = {
      name: input.task.name,
      version: input.task.version,
      sessionId: input.task.sessionId,
      requestedAt: input.requestedAt.toISOString(),
      ...(input.input === undefined ? {} : { input: input.input }),
   }

   if (input.phase === 'before') {
      return {
         ...envelopeCore(input),
         task: base,
      }
   }

   if (input.phase === 'on') {
      return {
         ...envelopeCore(input),
         task: {
            ...base,
            startedAt: iso(input.startedAt),
         },
      }
   }

   return {
      ...envelopeCore(input),
      task: {
         ...base,
         startedAt: iso(input.startedAt),
         finishedAt: iso(input.finishedAt),
         durationMs: input.durationMs,
         result: input.result,
         details: input.details,
         detailsStatus: input.detailsStatus,
      },
   }
}

export type EventFactType = 'choice' | 'boolean' | 'number' | 'text'

// A fact a condition may ask about, by scope: `event` (the event itself), `item` (one thing the event is about).
export type EventFact = {
   scope: 'event' | 'item'
   key: string
   label: string
   type: EventFactType
   values?: string[]
}

export const EVENT_FACTS: EventFact[] = [
   {
      scope: 'event',
      key: 'phase',
      label: 'The moment',
      type: 'choice',
      values: [...EVENT_PHASES],
   },
   {
      scope: 'event',
      key: 'task',
      label: 'The task',
      type: 'text',
   },
   {
      scope: 'event',
      key: 'status',
      label: 'How the task ended',
      type: 'text',
   },
   {
      scope: 'event',
      key: 'verdict',
      label: "The task's verdict",
      type: 'text',
   },
   {
      scope: 'event',
      key: 'startedBy',
      label: 'Who started it',
      type: 'choice',
      values: [...ORIGIN_KINDS],
   },
   {
      scope: 'event',
      key: 'account',
      label: 'The account',
      type: 'text',
   },
   {
      scope: 'event',
      key: 'durationSeconds',
      label: 'Seconds it took',
      type: 'number',
   },
]

export type TaskEventDetails = {
   version: number
   label: string
   // What its `details` counts under, in the JSON.
   counts: string[]
   // Facts about each item the event is about.
   itemFacts: EventFact[]
   // Made-up counts for samples.
   sample: Record<string, unknown>
}

const plannedBy: EventFact = {
   scope: 'item',
   key: 'plannedBy',
   label: 'Planned by (workflow)',
   type: 'text',
}

// Tasks that tell a workflow more than the envelope does. A task with no entry gives `details: null`, never an error.
export const TASK_EVENT_DETAILS: Record<string, TaskEventDetails> = {
   'linkedin-invite': {
      version: 1,
      label: 'Send connection requests',
      counts: ['SENT', 'SENT_WITHOUT_NOTE', 'NOT_SENT', 'WITHDRAWN', 'UNKNOWN'],
      itemFacts: [
         {
            scope: 'item',
            key: 'outcome',
            label: 'What happened to the invite',
            type: 'choice',
            values: ['SENT', 'SENT_WITHOUT_NOTE', 'NOT_SENT', 'WITHDRAWN', 'UNKNOWN'],
         },
         {
            scope: 'item',
            key: 'noteSent',
            label: 'The note went with it',
            type: 'boolean',
         },
         plannedBy,
      ],
      sample: {
         SENT: 3,
         SENT_WITHOUT_NOTE: 2,
      },
   },
   'linkedin-reply': {
      version: 1,
      label: 'Reply in a conversation',
      counts: ['SENT', 'FAILED', 'UNKNOWN'],
      itemFacts: [
         {
            scope: 'item',
            key: 'state',
            label: 'What happened to the reply',
            type: 'choice',
            values: ['SENT', 'FAILED', 'UNKNOWN'],
         },
         plannedBy,
      ],
      sample: { SENT: 1 },
   },
   'linkedin-message': {
      version: 1,
      label: 'Send a first message',
      counts: ['SENT', 'FAILED', 'UNKNOWN'],
      itemFacts: [
         {
            scope: 'item',
            key: 'state',
            label: 'What happened to the message',
            type: 'choice',
            values: ['SENT', 'FAILED', 'UNKNOWN'],
         },
         plannedBy,
      ],
      sample: { SENT: 1 },
   },
   'linkedin-messages': {
      version: 1,
      label: 'Read messages',
      counts: ['conversations', 'newMessages', 'truncated'],
      itemFacts: [
         {
            scope: 'item',
            key: 'mood',
            label: 'Mood of the new message',
            type: 'choice',
            values: [...MOODS],
         },
         {
            scope: 'item',
            key: 'direction',
            label: 'Who wrote the last message',
            type: 'choice',
            values: ['THEM', 'ME'],
         },
      ],
      sample: {
         conversations: 2,
         newMessages: 3,
      },
   },
   'linkedin-invitations': {
      version: 1,
      label: 'Read connection requests',
      counts: ['requests'],
      itemFacts: [],
      sample: { requests: 2 },
   },
   'linkedin-connections': {
      version: 1,
      label: 'Read connections',
      counts: ['connections', 'removed'],
      itemFacts: [],
      sample: { connections: 4 },
   },
   'linkedin-post': {
      version: 1,
      label: 'Write a post',
      counts: ['posted'],
      itemFacts: [],
      sample: { posted: 1 },
   },
}

// The facts the "If the event says" block offers for a task, or for every task when none is named.
export const factsOf = (task?: string): EventFact[] => {
   const own = task
      ? (TASK_EVENT_DETAILS[task]?.itemFacts ?? [])
      : Object.values(TASK_EVENT_DETAILS).flatMap(({ itemFacts }) => itemFacts)
   const seen = new Set<string>()

   return [...EVENT_FACTS, ...own].filter(({ scope, key }) => {
      const id = `${scope}.${key}`

      if (seen.has(id)) {
         return false
      }

      seen.add(id)

      return true
   })
}

export type FactValue = string | number | boolean | null | undefined

// One line of "If the event says": a fact named `scope.key`, and `is`, `isNot` or `unknown`. A fact that is not known matches
// neither yes nor no, so only `unknown` finds it.
export type FactCondition = { fact: string; is: 'is' | 'isNot' | 'unknown'; value: string }

export const conditionMatches = (condition: FactCondition, facts: Record<string, FactValue>) => {
   const got = facts[condition.fact]
   const known = got !== null && got !== undefined

   if (condition.is === 'unknown') {
      return !known
   }

   if (!known) {
      return false
   }

   const same = String(got) === condition.value

   return condition.is === 'is' ? same : !same
}

export const STARTED_BY_DEFAULT = [...ORIGIN_KINDS]

// What a trigger block asks of an event. Empty lists mean any.
export type EventTriggerSettings = {
   phase: EventPhase
   task: string
   accounts: string[]
   startedBy: string[]
   verdicts: string[]
   plannedBy: string[]
   ownTasks: boolean
}

export type EventMatchContext = {
   workflowId: string
   // The workflows that planned what the event is about (from the items); null when the event holds nothing of the kind.
   plannedByWorkflowIds?: string[]
}

export type EventMismatch = { filter: string; expected: string; got: string }

// Whether a workflow's trigger reacts to a task event, and which filter said no. The dispatcher, the editor's "Check an event" and the
// tests use this one function.
export const matchEvent = (
   settings: EventTriggerSettings,
   envelope: TaskEnvelope,
   context: EventMatchContext
): { ok: boolean; failed: EventMismatch[] } => {
   const failed: EventMismatch[] = []
   const no = (filter: string, expected: string, got: string) =>
      failed.push({
         filter,
         expected,
         got,
      })

   if (envelope.phase !== settings.phase) {
      no('moment', settings.phase, envelope.phase)
   }

   if (settings.task !== '' && envelope.task.name !== settings.task) {
      no('task', settings.task, envelope.task.name)
   }

   if (settings.accounts.length > 0 && !settings.accounts.includes(envelope.account?.id ?? '')) {
      no('accounts', settings.accounts.join(', '), envelope.account?.id ?? 'none')
   }

   if (settings.startedBy.length > 0 && !settings.startedBy.includes(envelope.startedBy.kind)) {
      no('started by', settings.startedBy.join(', '), envelope.startedBy.kind)
   }

   const verdict = envelope.task.result?.verdict ?? null

   if (envelope.phase === 'after' && settings.verdicts.length > 0 && !settings.verdicts.includes(verdict ?? '')) {
      no('verdict', settings.verdicts.join(', '), verdict ?? 'none')
   }

   const planned = context.plannedByWorkflowIds

   if (settings.plannedBy.length > 0 && !settings.plannedBy.some(id => planned?.includes(id))) {
      no('planned by', settings.plannedBy.join(', '), planned && planned.length > 0 ? planned.join(', ') : 'unknown')
   }

   if (!settings.ownTasks && envelope.startedBy.workflowId === context.workflowId) {
      no('own tasks', 'tasks of other workflows', 'a task this workflow started')
   }

   return {
      ok: failed.length === 0,
      failed,
   }
}

// Facts of an event for a condition: `event.*`.
export const eventFactsOf = (envelope: TaskEnvelope): Record<string, FactValue> => ({
   'event.phase': envelope.phase,
   'event.task': envelope.task.name,
   'event.status': envelope.task.result?.status ?? null,
   'event.verdict': envelope.task.result?.verdict ?? null,
   'event.startedBy': envelope.startedBy.kind,
   'event.account': envelope.account?.id ?? null,
   'event.durationSeconds': envelope.task.durationMs == null ? null : Math.round(envelope.task.durationMs / 1000),
})

// A realistic made-up event for a task, for the editor's reference and for previews with no real event.
export const sampleEvent = (task: string, phase: EventPhase): TaskEnvelope => {
   const at = new Date('2026-01-15T09:00:00Z')
   const finished = new Date('2026-01-15T09:00:41Z')

   return taskEnvelope({
      id: 'sample-event',
      phase,
      at,
      account: {
         id: 'sample-account',
         email: 'ada@example.com',
         displayName: 'Ada Lovelace',
      },
      proxy: {
         id: 'sample-proxy',
         protocol: 'http',
         country: 'IN',
      },
      startedBy: {
         kind: 'automation',
         job: 'sample',
      },
      task: {
         name: task,
         version: 1,
         sessionId: 'sample-session',
      },
      requestedAt: new Date('2026-01-15T08:59:50Z'),
      startedAt: at,
      finishedAt: finished,
      durationMs: 41_000,
      result: {
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Done.',
      },
      details: TASK_EVENT_DETAILS[task]?.sample ?? null,
      detailsStatus: TASK_EVENT_DETAILS[task] ? 'ready' : 'none',
   })
}
