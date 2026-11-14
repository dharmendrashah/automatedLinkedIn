import { describe, expect, it } from 'vitest'

import type { WorkflowSummary } from './types'

import { metricsOf, scheduleOf, shortName } from './workflow-row'

type Run = WorkflowSummary['runs'][number]

const run = (patch: Partial<Run> = {}): Run => ({
   id: 'r',
   workflowId: 'w',
   trigger: 'SCHEDULE',
   kind: 'WORKFLOW',
   status: 'SUCCEEDED',
   estimateMicros: 0,
   costMicros: 102_000,
   qualified: 2,
   maybe: 0,
   discarded: 9,
   message: null,
   stopRequestedAt: null,
   startedAt: '2026-11-14T10:00:00.000Z',
   finishedAt: '2026-11-14T10:05:00.000Z',
   ...patch,
})

describe('metricsOf', () => {
   it('shows nothing for a workflow that never ran', () => {
      expect(metricsOf(undefined)).toEqual({
         found: null,
         qualified: null,
         maybe: null,
         cost: null,
         perQualified: null,
      })
   })

   it('counts the people found and the cost per qualified person of a finished run', () => {
      expect(metricsOf(run())).toEqual({ found: 11, qualified: 2, maybe: 0, cost: 102_000, perQualified: 51_000 })
   })

   it('has no cost per qualified person when nobody qualified', () => {
      expect(metricsOf(run({ qualified: 0, maybe: 3, discarded: 4 }))).toMatchObject({ found: 7, perQualified: null })
   })

   it('shows no result numbers for a run still going, a failed run, or a run that scored nobody', () => {
      for (const status of ['RUNNING', 'QUEUED', 'FAILED'] as const) {
         expect(metricsOf(run({ status }))).toMatchObject({ found: null, qualified: null, maybe: null })
      }

      expect(metricsOf(run({ qualified: 0, maybe: 0, discarded: 0 }))).toMatchObject({ found: null, qualified: null })
   })

   it('keeps the cost of a run that is going, so the page can show what is spent', () => {
      expect(metricsOf(run({ status: 'RUNNING', costMicros: 40_000 })).cost).toBe(40_000)
   })
})

describe('scheduleOf', () => {
   const graph = (type: string) => ({ nodes: [{ type }] }) as unknown as WorkflowSummary['graph']

   it('tells a switched-on schedule, a switched-off one and a workflow started by hand apart', () => {
      expect(scheduleOf({ graph: graph('trigger.schedule'), enabled: true })).toBe('on')
      expect(scheduleOf({ graph: graph('trigger.schedule'), enabled: false })).toBe('off')
      expect(scheduleOf({ graph: graph('trigger.manual'), enabled: false })).toBe('manual')
   })
})

describe('shortName', () => {
   it('drops the campaign name a campaign workflow repeats', () => {
      expect(shortName({ name: 'Acme · 6 No answer', campaign: { name: 'Acme' } })).toEqual({
         name: '6 No answer',
         stageInName: true,
      })
   })

   it('keeps any other name whole', () => {
      expect(shortName({ name: 'Intent radar', campaign: { name: 'Acme' } })).toEqual({
         name: 'Intent radar',
         stageInName: false,
      })
      expect(shortName({ name: 'Acme · ', campaign: { name: 'Acme' } }).name).toBe('Acme · ')
      expect(shortName({ name: 'Acme · 1 Discover', campaign: null }).name).toBe('Acme · 1 Discover')
   })
})
