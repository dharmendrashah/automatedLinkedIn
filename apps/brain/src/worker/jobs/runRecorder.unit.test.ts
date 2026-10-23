import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type JobRunInput } from 'database'

import { RunRecorder } from './runRecorder'

const run = (job: string): JobRunInput => ({
   job,
   startedAt: new Date(0),
   finishedAt: new Date(1),
   outcome: 'IDLE',
})

describe('RunRecorder', () => {
   beforeEach(() => {
      vi.useFakeTimers()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should save the runs in one batch on the flush interval', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const recorder = new RunRecorder(save, { error: vi.fn() })

      recorder.start()
      recorder.add(run('a'))
      recorder.add(run('b'))
      await vi.advanceTimersByTimeAsync(4999)

      expect(save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(save).toHaveBeenCalledTimes(1)
      expect(save.mock.calls[0][0].map((saved: JobRunInput) => saved.job)).toEqual(['a', 'b'])
      await recorder.stop()
   })

   it('should keep the runs when the save fails, and save them on the next flush', async () => {
      const save = vi.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValue(undefined)
      const log = { error: vi.fn() }
      const recorder = new RunRecorder(save, log)

      recorder.add(run('a'))
      await recorder.flush()
      recorder.add(run('b'))
      await recorder.flush()

      expect(save).toHaveBeenCalledTimes(2)
      expect(save.mock.calls[1][0].map((saved: JobRunInput) => saved.job)).toEqual(['a', 'b'])
      expect(log.error).toHaveBeenCalledTimes(1)
   })

   it('should say a failed save once a minute, not on every flush', async () => {
      const save = vi.fn().mockRejectedValue(new Error('database down'))
      const log = { error: vi.fn() }
      const recorder = new RunRecorder(save, log)

      recorder.add(run('a'))
      await recorder.flush()
      await recorder.flush()
      await vi.advanceTimersByTimeAsync(60_000)
      await recorder.flush()

      expect(log.error).toHaveBeenCalledTimes(2)
   })

   it('should drop the oldest runs past its limit', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const recorder = new RunRecorder(save, { error: vi.fn() }, { maxBuffered: 2 })

      recorder.add(run('a'))
      recorder.add(run('b'))
      recorder.add(run('c'))
      await recorder.flush()

      expect(save.mock.calls[0][0].map((saved: JobRunInput) => saved.job)).toEqual(['b', 'c'])
   })

   it('should save what is left when it stops', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const recorder = new RunRecorder(save, { error: vi.fn() })

      recorder.start()
      recorder.add(run('a'))
      await recorder.stop()

      expect(save).toHaveBeenCalledTimes(1)
   })
})
