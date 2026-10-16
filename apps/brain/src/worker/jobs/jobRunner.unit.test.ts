import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type JobDefinition } from './defineJob'
import { JobRunner } from './jobRunner'

const setup = (overrides: Partial<JobDefinition> = {}) => {
   const log = {
      info: vi.fn(),
      error: vi.fn(),
   }
   const run = vi.fn<JobDefinition['run']>().mockResolvedValue(undefined)
   const runner = new JobRunner(
      {
         name: 'scoring',
         everyMs: 1000,
         startAfterMs: 100,
         timeoutMs: 500,
         run,
         ...overrides,
      },
      log
   )

   return {
      runner,
      run,
      log,
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
})
