import { describe, expect, it } from 'vitest'

import { type Graph, type StepRun } from './types'

import { adviceOf, blockRunOf } from './block-run'

const advice = (code: string) => ({
   code,
   title: code,
   why: [],
   fixes: [],
})

describe('adviceOf', () => {
   it('should find the advice of a code and fall back to the unknown one', () => {
      const catalog = [advice('ICP_DELETED'), advice('UNKNOWN')] as Parameters<typeof adviceOf>[0]

      expect(adviceOf(catalog, 'ICP_DELETED')?.code).toBe('ICP_DELETED')
      expect(adviceOf(catalog, null)?.code).toBe('UNKNOWN')
      expect(adviceOf(catalog, 'OLD_CODE')?.code).toBe('UNKNOWN')
      expect(adviceOf([], 'ICP_DELETED')).toBeNull()
   })
})

const step = (over: Partial<StepRun> = {}): StepRun => ({
   id: 's1',
   nodeId: 'a',
   type: 'collect.commenters',
   status: 'DONE',
   round: 0,
   itemsIn: 3,
   itemsOut: 2,
   costMicros: 0,
   message: null,
   errorCode: null,
   childRunId: null,
   tries: 0,
   waitUntil: null,
   child: null,
   progress: null,
   ...over,
})

const graph = (config: Record<string, string | number> = { howMany: 5 }): Graph => ({
   nodes: [
      {
         id: 'a',
         type: 'collect.commenters',
         config,
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const run = (steps: StepRun[], status = 'SUCCEEDED', finishedAt: string | null = '2026-11-01T10:00:00.000Z') => ({
   status,
   finishedAt,
   graph: graph(),
   steps,
})

const now = new Date('2026-11-02T10:00:00.000Z')

describe('blockRunOf', () => {
   it('should say a block never ran when there is no run, or the run has no step for it, and open on its input', () => {
      expect(blockRunOf('a', { howMany: 5 }, null, now)).toMatchObject({
         state: 'never',
         defaultTab: 'input',
         addedAfter: false,
      })
      expect(blockRunOf('a', { howMany: 5 }, run([]), now)).toMatchObject({
         state: 'never',
         defaultTab: 'input',
      })
   })

   it('should open on the output once a block ran, whatever it ended in', () => {
      const states = [
         ['DONE', 'done'],
         ['PARTIAL', 'gaps'],
         ['FAILED', 'failed'],
      ] as const

      for (const [status, state] of states) {
         expect(blockRunOf('a', { howMany: 5 }, run([step({ status })]), now)).toMatchObject({
            state,
            defaultTab: 'output',
         })
      }
   })

   it('should call a block that is held, or is being worked on, waiting or working and open on its input', () => {
      const live = (steps: StepRun[]) => run(steps, 'RUNNING', null)

      expect(blockRunOf('a', { howMany: 5 }, live([step({ status: 'WAITING' })]), now)).toMatchObject({
         state: 'waiting',
         defaultTab: 'input',
      })
      expect(blockRunOf('a', { howMany: 5 }, live([step({ status: 'RUNNING' })]), now).state).toBe('working')
   })

   it('should call a step that never started in a run that ended not run', () => {
      expect(blockRunOf('a', { howMany: 5 }, run([step({ status: 'WAITING' })], 'STOPPED'), now).state).toBe('never')
   })

   it('should flag a block added after the run, and one whose settings changed after it', () => {
      expect(blockRunOf('b', {}, run([step()]), now)).toMatchObject({
         state: 'never',
         addedAfter: true,
      })
      expect(blockRunOf('a', { howMany: 9 }, run([step()]), now).changedAfter).toBe(true)
      expect(blockRunOf('a', { howMany: 5 }, run([step()]), now).changedAfter).toBe(false)
   })

   it('should treat results older than 14 days as expired, only for a run that has ended', () => {
      const old = run([step()], 'SUCCEEDED', '2026-10-01T10:00:00.000Z')

      expect(blockRunOf('a', { howMany: 5 }, old, now).expired).toBe(true)
      expect(blockRunOf('a', { howMany: 5 }, run([step()]), now).expired).toBe(false)
      expect(blockRunOf('a', { howMany: 5 }, run([step()], 'RUNNING', null), now).expired).toBe(false)
   })

   it('should add the rounds of a loop up and take the error of the round that failed', () => {
      const result = blockRunOf(
         'a',
         { howMany: 5 },
         run([
            step({ round: 0 }),
            step({
               id: 's2',
               round: 1,
               status: 'FAILED',
               errorCode: 'DATA_REJECTED',
            }),
         ]),
         now
      )

      expect(result).toMatchObject({
         state: 'failed',
         rounds: 2,
      })
      expect(result.step).toMatchObject({
         itemsIn: 6,
         errorCode: 'DATA_REJECTED',
      })
   })
})
