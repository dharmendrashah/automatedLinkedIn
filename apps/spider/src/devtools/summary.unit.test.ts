import { describe, expect, it } from 'vitest'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { formatRun, summarise } from './summary'

describe('summarise', () => {
   it('should count passes, group verdicts and give the durations', () => {
      const lines = summarise([
         {
            ok: true,
            verdict: 'VALID',
            durationMs: 4000,
         },
         {
            ok: true,
            verdict: 'VALID',
            durationMs: 6000,
         },
         {
            ok: false,
            verdict: 'ERROR',
            durationMs: 11_000,
         },
      ])

      expect(lines).toEqual([
         'Runs: 3, succeeded: 2',
         'Verdicts: VALID x2, ERROR x1',
         'Duration: shortest 4.0s, average 7.0s, longest 11.0s',
      ])
   })
})

describe('formatRun', () => {
   const result = {
      status: 'FAILED',
      verdict: 'DETECTED',
      message: 'At least one detection page took this browser for a bot.',
      started_at: '2026-10-15T10:00:00.000Z',
      finished_at: '2026-10-15T10:00:12.500Z',
      report: {
         headline: 'One page flagged the browser',
         sections: [
            {
               title: 'Pixelscan',
               items: [
                  {
                     label: 'Result',
                     value: 'Looks like a bot',
                     status: 'fail',
                  },
               ],
            },
         ],
      },
   } as TaskResult

   it('should show the verdict, the message and the report', () => {
      expect(formatRun(result, 'Detected')).toEqual([
         'FAILED \u2014 Detected (DETECTED) in 12.5s',
         'At least one detection page took this browser for a bot.',
         'One page flagged the browser',
         '  Pixelscan',
         '    Result: Looks like a bot [fail]',
      ])
   })

   it('should not repeat a headline that is the message', () => {
      const same = {
         ...result,
         report: {
            ...result.report,
            headline: result.message,
         },
      } as TaskResult

      expect(formatRun(same, 'Detected').filter(line => line === result.message)).toHaveLength(1)
   })

   it('should skip the report when the task returned none', () => {
      expect(
         formatRun(
            {
               ...result,
               report: undefined,
            },
            'Detected'
         )
      ).toHaveLength(2)
   })
})
