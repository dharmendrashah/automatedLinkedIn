import { describe, expect, it } from 'vitest'

import {
   type EventTriggerSettings,
   conditionMatches,
   eventFactsOf,
   factsOf,
   matchEvent,
   originOfTrigger,
   sampleEvent,
   taskEnvelope,
} from './events'

const settings: EventTriggerSettings = {
   phase: 'after',
   task: 'linkedin-invite',
   accounts: [],
   startedBy: [],
   verdicts: [],
   plannedBy: [],
   ownTasks: false,
}
const context = { workflowId: 'w1' }

describe('taskEnvelope', () => {
   const input = {
      id: 'e1',
      at: new Date('2026-01-01T00:00:00Z'),
      account: null,
      proxy: null,
      startedBy: { kind: 'owner' as const },
      task: {
         name: 'linkedin-invite',
         version: 2,
         sessionId: 's1',
      },
      requestedAt: new Date('2025-12-31T23:59:00Z'),
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T00:00:30Z'),
      durationMs: 30_000,
      result: {
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: null,
      },
      details: { SENT: 1 },
      detailsStatus: 'ready' as const,
   }

   it('should leave times, result and details out of a before event', () => {
      expect(
         taskEnvelope({
            ...input,
            phase: 'before',
         }).task
      ).toEqual({
         name: 'linkedin-invite',
         version: 2,
         sessionId: 's1',
         requestedAt: '2025-12-31T23:59:00.000Z',
      })
   })

   it('should add only the start to an on event', () => {
      const { task } = taskEnvelope({
         ...input,
         phase: 'on',
      })

      expect(task.startedAt).toBe('2026-01-01T00:00:00.000Z')
      expect(task).not.toHaveProperty('result')
   })

   it('should give an after event everything', () => {
      const { task } = taskEnvelope({
         ...input,
         phase: 'after',
      })

      expect(task).toMatchObject({
         durationMs: 30_000,
         details: { SENT: 1 },
         detailsStatus: 'ready',
      })
   })
})

describe('originOfTrigger', () => {
   it('should read the old trigger words', () => {
      expect(originOfTrigger('manual')).toEqual({ kind: 'owner' })
      expect(originOfTrigger('retry')).toEqual({ kind: 'retry' })
      expect(originOfTrigger('automatic', 'invite-send')).toEqual({
         kind: 'automation',
         job: 'invite-send',
      })
   })
})

describe('matchEvent', () => {
   const event = sampleEvent('linkedin-invite', 'after')

   it('should match the sample for a plain trigger', () => {
      expect(matchEvent(settings, event, context)).toEqual({
         ok: true,
         failed: [],
      })
   })

   it('should say which filters failed', () => {
      const result = matchEvent(
         {
            ...settings,
            phase: 'before',
            task: 'linkedin-reply',
         },
         event,
         context
      )

      expect(result.ok).toBe(false)
      expect(result.failed.map(({ filter }) => filter)).toEqual(['moment', 'task'])
   })

   it('should filter by account, who started it and verdict', () => {
      expect(
         matchEvent(
            {
               ...settings,
               accounts: ['other'],
            },
            event,
            context
         ).ok
      ).toBe(false)
      expect(
         matchEvent(
            {
               ...settings,
               accounts: ['sample-account'],
            },
            event,
            context
         ).ok
      ).toBe(true)
      expect(
         matchEvent(
            {
               ...settings,
               startedBy: ['owner'],
            },
            event,
            context
         ).ok
      ).toBe(false)
      expect(
         matchEvent(
            {
               ...settings,
               verdicts: ['DONE'],
            },
            event,
            context
         ).ok
      ).toBe(true)
      expect(
         matchEvent(
            {
               ...settings,
               verdicts: ['PARTIAL'],
            },
            event,
            context
         ).ok
      ).toBe(false)
   })

   it('should treat an empty list as any, for every started-by mix', () => {
      for (const kind of ['owner', 'automation', 'workflow', 'retry', 'event'] as const) {
         const started = {
            ...event,
            startedBy: { kind },
         }

         expect(matchEvent(settings, started, context).ok).toBe(true)
         expect(
            matchEvent(
               {
                  ...settings,
                  startedBy: [kind],
               },
               started,
               context
            ).ok
         ).toBe(true)
      }
   })

   it('should skip the tasks of its own workflow unless it says so', () => {
      const own = {
         ...event,
         startedBy: {
            kind: 'workflow' as const,
            workflowId: 'w1',
         },
      }

      expect(matchEvent(settings, own, context).ok).toBe(false)
      expect(
         matchEvent(
            {
               ...settings,
               ownTasks: true,
            },
            own,
            context
         ).ok
      ).toBe(true)
   })

   it('should need a planning workflow it knows when planned by is set', () => {
      const planned = {
         ...settings,
         plannedBy: ['w9'],
      }

      expect(matchEvent(planned, event, context).ok).toBe(false)
      expect(
         matchEvent(planned, event, {
            ...context,
            plannedByWorkflowIds: ['w9'],
         }).ok
      ).toBe(true)
   })
})

describe('conditionMatches', () => {
   it('should match a known fact, and not a fact that is not known unless asked', () => {
      expect(
         conditionMatches(
            {
               fact: 'item.noteSent',
               is: 'is',
               value: 'false',
            },
            { 'item.noteSent': false }
         )
      ).toBe(true)
      expect(
         conditionMatches(
            {
               fact: 'item.noteSent',
               is: 'is',
               value: 'false',
            },
            { 'item.noteSent': null }
         )
      ).toBe(false)
      expect(
         conditionMatches(
            {
               fact: 'item.noteSent',
               is: 'isNot',
               value: 'false',
            },
            { 'item.noteSent': null }
         )
      ).toBe(false)
      expect(
         conditionMatches(
            {
               fact: 'item.noteSent',
               is: 'unknown',
               value: '',
            },
            {}
         )
      ).toBe(true)
   })
})

describe('facts', () => {
   it('should list the event facts and the task facts once each', () => {
      const keys = factsOf('linkedin-invite').map(({ scope, key }) => `${scope}.${key}`)

      expect(keys).toContain('event.verdict')
      expect(keys).toContain('item.noteSent')
      expect(new Set(keys).size).toBe(keys.length)
   })

   it('should read facts from an envelope', () => {
      expect(eventFactsOf(sampleEvent('linkedin-invite', 'after'))).toMatchObject({
         'event.verdict': 'DONE',
         'event.durationSeconds': 41,
      })
   })

   it('should give a task with no declaration no details and no error', () => {
      expect(sampleEvent('browser-detection', 'after').task.details).toBeNull()
   })
})
