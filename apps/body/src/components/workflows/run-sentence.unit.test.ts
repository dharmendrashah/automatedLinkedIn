import { describe, expect, it } from 'vitest'

import { runSentence } from './run-sentence'

const NOW = new Date('2026-10-18T10:00:00')

const step = (fields: Partial<Parameters<typeof runSentence>[0]['steps'][number]> = {}) => ({
   nodeId: 'n1',
   type: 'collect.commenters',
   status: 'DONE' as const,
   itemsIn: 0,
   itemsOut: 0,
   message: null,
   progress: null,
   ...fields,
})

const run = (fields: Partial<Parameters<typeof runSentence>[0]> = {}) => ({
   status: 'RUNNING' as const,
   stopRequestedAt: null,
   costMicros: 1_800_000,
   estimateMicros: 4_000_000,
   qualified: 0,
   maybe: 0,
   discarded: 0,
   message: null,
   steps: [],
   ...fields,
})

const labelOf = (type: string) => (type === 'collect.commenters' ? 'Get commenters' : type)

describe('runSentence', () => {
   it('should say what is working, how far along, and what was spent of the most it can cost', () => {
      expect(
         runSentence(
            run({
               steps: [
                  step({
                     status: 'RUNNING',
                     progress: {
                        requests: 5,
                        done: 3,
                        failed: 0,
                        uncharged: 0,
                        retrying: 0,
                        nextRetryAt: null,
                     },
                  }),
               ],
            }),
            labelOf,
            NOW
         )
      ).toBe('Running: Get commenters, 3 of 5 requests done. About $1.80 spent of up to $4.00.')
   })

   it('should say when a run held by a Wait goes on', () => {
      const held = run({ steps: [step({ status: 'WAITING', waitUntil: '2026-11-10T14:30:00' })] })

      expect(runSentence(held, labelOf, NOW)).toMatch(/^Waiting until .+\. About \$1\.80 spent of up to \$4\.00\.$/)
      // A wait that has passed is not mentioned.
      expect(
         runSentence(run({ steps: [step({ status: 'WAITING', waitUntil: '2026-10-18T09:00:00' })] }), labelOf, NOW)
      ).toMatch(/^Running: starting/)
   })

   it('should say when a retry is due, with the day when it is not today', () => {
      const waiting = (at: string) =>
         run({
            steps: [
               step({
                  status: 'WAITING',
                  progress: {
                     requests: 5,
                     done: 3,
                     failed: 0,
                     uncharged: 0,
                     retrying: 2,
                     nextRetryAt: at,
                  },
               }),
            ],
         })

      expect(runSentence(waiting('2026-10-18T10:15:00'), labelOf, NOW)).toMatch(
         /^Waiting to retry 2 requests at 10:15( am)? \(retries are not charged unless they answer\)\./i
      )
      expect(runSentence(waiting('2026-10-19T09:00:00'), labelOf, NOW)).toMatch(/at \S+ 09:00/)
   })

   it('should sum up a finished, gapped, stopping, stopped and failed run in plain words', () => {
      expect(
         runSentence(
            run({
               status: 'SUCCEEDED',
               costMicros: 3_100_000,
               qualified: 12,
               maybe: 9,
               discarded: 119,
            }),
            labelOf,
            NOW
         )
      ).toBe('Done: 12 qualified and 9 maybe from 140 people (9%) for $3.10, $0.258 per qualified person.')
      expect(
         runSentence(
            run({
               status: 'SUCCEEDED',
               costMicros: 52_000,
               steps: [
                  step({
                     type: 'output.list',
                     itemsOut: 8,
                  }),
               ],
            }),
            labelOf,
            NOW
         )
      ).toBe('Done: 8 people added to the list for $0.052, $0.007 a person.')
      expect(
         runSentence(
            run({
               status: 'PARTIAL',
               steps: [
                  step({
                     status: 'PARTIAL',
                     progress: {
                        requests: 5,
                        done: 5,
                        failed: 2,
                        uncharged: 2,
                        retrying: 0,
                        nextRetryAt: null,
                     },
                  }),
               ],
            }),
            labelOf,
            NOW
         )
      ).toBe('Done with gaps: 2 requests never answered (not charged). What was found is kept.')
      expect(
         runSentence(
            run({
               stopRequestedAt: '2026-10-18T09:59:00',
               steps: [
                  step({
                     status: 'RUNNING',
                     progress: {
                        requests: 5,
                        done: 2,
                        failed: 0,
                        uncharged: 0,
                        retrying: 0,
                        nextRetryAt: null,
                     },
                  }),
               ],
            }),
            labelOf,
            NOW
         )
      ).toBe('Stopping: finishing 3 requests already paid for. What they find is kept.')
      expect(
         runSentence(
            run({
               status: 'STOPPED',
               qualified: 4,
               costMicros: 1_200_000,
            }),
            labelOf,
            NOW
         )
      ).toBe('Stopped by you: 4 qualified for $1.20.')
      expect(
         runSentence(
            run({
               status: 'FAILED',
               message: 'The ideal customer this workflow scores against was deleted.',
            }),
            labelOf,
            NOW
         )
      ).toBe('Failed: The ideal customer this workflow scores against was deleted.')
   })
})
