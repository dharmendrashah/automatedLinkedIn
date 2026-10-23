import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type JobDefinition } from './defineJob'
import { JobRunner } from './jobRunner'

const setup = (overrides: Partial<JobDefinition> = {}) => {
   const log = {
      info: vi.fn(),
      error: vi.fn(),
   }
   const run = vi.fn<JobDefinition['run']>().mockResolvedValue(undefined)
   const record = vi.fn()
   const runner = new JobRunner(
      {
         name: 'scoring',
         title: 'Scoring',
         purpose: 'Scores things.',
         everyMs: 1000,
         startAfterMs: 100,
         timeoutMs: 500,
         run,
         ...overrides,
      },
      log,
      record
   )

   return {
      runner,
      run,
      log,
      record,
   }
}

describe('JobRunner', () => {
   beforeEach(() => {
      vi.useFakeTimers()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should run after the start delay and then on every interval', async () => {
      const { runner, run } = setup()

      runner.start()
      await vi.advanceTimersByTimeAsync(99)

      expect(run).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(run).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)

      expect(run).toHaveBeenCalledTimes(3)
      await runner.stop(0)
   })

   it('should write a log line only when the job reports something', async () => {
      const { runner, run, log } = setup()

      run.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ summary: '3 scored, 0 failed' })
      await runner.runNow()
      await runner.runNow()

      expect(log.info).toHaveBeenCalledTimes(1)
      expect(log.info).toHaveBeenCalledWith('worker job=scoring 3 scored, 0 failed')
      expect(runner.state()).toMatchObject({
         runs: 2,
         lastOutcome: 'ok',
         failureStreak: 0,
      })
   })

   it('should not let a failing job stop the schedule, and count the failures in a row', async () => {
      const { runner, run, log } = setup()

      run.mockRejectedValue(new Error('AbuseIPDB said no'))
      runner.start()
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(1000)

      expect(run).toHaveBeenCalledTimes(2)
      expect(log.error).toHaveBeenCalledWith('worker job=scoring failed: AbuseIPDB said no')
      expect(runner.state()).toMatchObject({
         lastOutcome: 'failed',
         failureStreak: 2,
      })

      run.mockResolvedValue(undefined)
      await vi.advanceTimersByTimeAsync(1000)

      expect(runner.state().failureStreak).toBe(0)
      await runner.stop(0)
   })

   it('should skip a tick while the previous run is still going', async () => {
      const { runner, run } = setup({ timeoutMs: 60_000 })
      let finish: () => void = () => undefined

      run.mockImplementation(
         () =>
            new Promise<undefined>(resolve => {
               finish = () => resolve(undefined)
            })
      )
      runner.start()
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(3000)

      expect(run).toHaveBeenCalledTimes(1)
      expect(runner.state().running).toBe(true)

      run.mockResolvedValue(undefined)
      finish()
      await vi.advanceTimersByTimeAsync(1000)

      expect(run).toHaveBeenCalledTimes(2)
      await runner.stop(0)
   })

   it('should abort the signal at the timeout and record it', async () => {
      const { runner, run, log } = setup()
      let signal: AbortSignal | undefined

      run.mockImplementation(
         ({ signal: given }) =>
            new Promise<undefined>(resolve => {
               signal = given
               given.addEventListener('abort', () => resolve(undefined))
            })
      )

      const finished = runner.runNow()

      await vi.advanceTimersByTimeAsync(500)
      await finished

      expect(signal?.aborted).toBe(true)
      expect(runner.state().lastOutcome).toBe('timed-out')
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ran past its 500 ms limit'))
   })

   it('should stop scheduling, and wait for a run in progress only up to the grace', async () => {
      const { runner, run } = setup({ timeoutMs: 60_000 })

      run.mockReturnValue(new Promise(() => undefined))
      runner.start()
      await vi.advanceTimersByTimeAsync(100)

      const stopped = runner.stop(2000)

      await vi.advanceTimersByTimeAsync(2000)
      await stopped
      await vi.advanceTimersByTimeAsync(10_000)

      expect(run).toHaveBeenCalledTimes(1)
   })

   it('should not start after it was stopped', async () => {
      const { runner, run } = setup()

      await runner.stop(0)
      runner.start()
      await vi.advanceTimersByTimeAsync(5000)

      expect(run).not.toHaveBeenCalled()
   })

   it('should record every run, an idle one too, with what the job reported', async () => {
      const { runner, run, record } = setup()
      const items = [
         {
            accountId: 'a1',
            action: 'messages-read',
            result: 'ASKED' as const,
         },
      ]

      run.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
         summary: '1 read',
         counts: { reads: 1 },
         items,
      })
      await runner.runNow()
      await runner.runNow()

      expect(record).toHaveBeenCalledTimes(2)
      expect(record.mock.calls[0][0]).toMatchObject({
         job: 'scoring',
         outcome: 'IDLE',
      })
      expect(record.mock.calls[1][0]).toMatchObject({
         outcome: 'WORKED',
         summary: '1 read',
         counts: { reads: 1 },
         items,
      })
      expect(record.mock.calls[1][0].finishedAt.getTime()).toBeGreaterThanOrEqual(
         record.mock.calls[1][0].startedAt.getTime()
      )
   })

   it('should record a failure with its error, and a run past its limit as timed out', async () => {
      const { runner, run, record } = setup()
      const failure = new Error('AbuseIPDB said no')

      run.mockRejectedValueOnce(failure)
      await runner.runNow()

      expect(record.mock.calls[0][0]).toMatchObject({
         outcome: 'FAILED',
         error: failure,
      })

      run.mockImplementationOnce(
         ({ signal }) =>
            new Promise<undefined>(resolve => {
               signal.addEventListener('abort', () => resolve(undefined))
            })
      )

      const finished = runner.runNow()

      await vi.advanceTimersByTimeAsync(500)
      await finished

      expect(record.mock.calls[1][0]).toMatchObject({ outcome: 'TIMED_OUT' })
   })

   it('should not record a tick that was skipped because a run was going', async () => {
      const { runner, run, record } = setup({ timeoutMs: 60_000 })
      let finish: () => void = () => undefined

      run.mockImplementationOnce(
         () =>
            new Promise<undefined>(resolve => {
               finish = () => resolve(undefined)
            })
      )

      const first = runner.runNow()

      await runner.runNow()
      finish()
      await first

      expect(record).toHaveBeenCalledTimes(1)
   })
})
