import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JOBS } from './registry'

const mocks = vi.hoisted(() => ({
   runDue: vi.fn(),
   dispatchDue: vi.fn(),
}))

vi.mock('database', () => ({
   ProxyScoringJob: { runDue: mocks.runDue },
   TaskDispatchService: { dispatchDue: mocks.dispatchDue },
}))

vi.mock('env', () => ({
   MINDCASE_API_KEY: '',
   MINDCASE_RPM: 45,
}))

const [proxyScoring, taskDispatch] = JOBS
const context = { signal: new AbortController().signal }

describe('worker jobs', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should register proxy scoring, hourly, first a minute after the start', () => {
      expect(proxyScoring).toMatchObject({
         name: 'proxy-scoring',
         everyMs: 3_600_000,
         startAfterMs: 60_000,
      })
   })

   it('should report a summary when proxies were scored or failed', async () => {
      mocks.runDue.mockResolvedValue({
         scored: 3,
         failed: 1,
      })

      await expect(proxyScoring.run(context)).resolves.toEqual({ summary: '3 scored, 1 failed' })
   })

   it('should report nothing when nothing was due, so a quiet hour writes no log line', async () => {
      mocks.runDue.mockResolvedValue({
         scored: 0,
         failed: 0,
      })

      await expect(proxyScoring.run(context)).resolves.toBeUndefined()
   })

   it('should register task dispatch every 10 seconds, with a limit below the lease of a row', () => {
      expect(taskDispatch).toMatchObject({
         name: 'task-dispatch',
         everyMs: 10_000,
         startAfterMs: 15_000,
      })
   })

   it('should give the job signal to the dispatch, so it stops when the job runs out of time', async () => {
      mocks.dispatchDue.mockResolvedValue({
         published: 0,
         retried: 0,
         gaveUp: 0,
      })

      await taskDispatch.run(context)

      expect(mocks.dispatchDue).toHaveBeenCalledWith(context.signal)
   })

   it('should report what it published or gave up', async () => {
      mocks.dispatchDue.mockResolvedValue({
         published: 2,
         retried: 1,
         gaveUp: 1,
      })

      await expect(taskDispatch.run(context)).resolves.toEqual({ summary: '2 published, 1 given up' })
   })

   it('should report nothing for an empty table or for retries only, so a broker outage is not a log line a run', async () => {
      mocks.dispatchDue.mockResolvedValue({
         published: 0,
         retried: 4,
         gaveUp: 0,
      })

      await expect(taskDispatch.run(context)).resolves.toBeUndefined()
   })
})
