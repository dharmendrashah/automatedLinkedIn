import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JOBS } from './registry'

const mocks = vi.hoisted(() => ({
   runDue: vi.fn(),
   dispatchDue: vi.fn(),
   retention: vi.fn(),
   accountDue: vi.fn(),
}))

vi.mock('database', () => ({
   ProxyScoringJob: { runDue: mocks.runDue },
   TaskDispatchService: { dispatchDue: mocks.dispatchDue },
   RetentionService: { run: mocks.retention },
   AccountDailyJob: { runDue: mocks.accountDue },
}))

vi.mock('env', () => ({
   MINDCASE_API_KEY: '',
   MINDCASE_RPM: 45,
}))

const [proxyScoring, taskDispatch] = JOBS
const retention = JOBS.find(({ name }) => name === 'retention')
const accountDaily = JOBS.find(({ name }) => name === 'account-daily')
const context = { signal: new AbortController().signal }
const item = {
   userId: 'u1',
   accountId: 'a1',
   action: 'proxy-score',
   result: 'ASKED' as const,
   reason: 'Tested again and scored',
}

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
         items: [item],
      })

      await expect(proxyScoring.run(context)).resolves.toEqual({
         summary: '3 scored, 1 failed',
         counts: {
            scored: 3,
            failed: 1,
         },
         items: [item],
      })
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

      await expect(taskDispatch.run(context)).resolves.toEqual({
         summary: '2 published, 1 given up',
         counts: {
            published: 2,
            gaveUp: 1,
         },
      })
   })

   it('should report nothing for an empty table or for retries only, so a broker outage is not a log line a run', async () => {
      mocks.dispatchDue.mockResolvedValue({
         published: 0,
         retried: 4,
         gaveUp: 0,
      })

      await expect(taskDispatch.run(context)).resolves.toBeUndefined()
   })

   it('should report only what retention deleted or marked, and nothing on a quiet run', async () => {
      mocks.retention.mockResolvedValueOnce({
         items: 5,
         runs: 0,
         marked: 2,
      })
      mocks.retention.mockResolvedValueOnce({
         items: 0,
         runs: 0,
      })

      await expect(retention?.run(context)).resolves.toMatchObject({ summary: '5 items, 2 marked' })
      await expect(retention?.run(context)).resolves.toBeUndefined()
   })

   it('should give every job a title and a purpose for the cron monitor', () => {
      for (const job of JOBS) {
         expect(job.title.length).toBeGreaterThan(0)
         expect(job.purpose.length).toBeGreaterThan(0)
      }
   })

   it('should hand the accounts of the daily job to the monitor, and log only what was asked for', async () => {
      const item = {
         userId: 'u1',
         accountId: 'a1',
         action: 'messages-read',
         result: 'SKIPPED' as const,
         reason: 'Not signed in successfully in the last day',
      }

      mocks.accountDue.mockResolvedValueOnce({
         accounts: 2,
         checks: 0,
         visits: 0,
         reads: 1,
         drawn: 0,
         items: [item],
      })
      mocks.accountDue.mockResolvedValueOnce({
         accounts: 1,
         checks: 0,
         visits: 0,
         reads: 0,
         drawn: 1,
         items: [item],
      })
      mocks.accountDue.mockResolvedValueOnce({
         accounts: 0,
         checks: 0,
         visits: 0,
         reads: 0,
         drawn: 0,
         items: [],
      })

      await expect(accountDaily?.run(context)).resolves.toMatchObject({
         summary: '0 sign-in checks, 0 visits, 1 message reads asked for',
         counts: {
            accountsDue: 2,
            reads: 1,
            skipped: 1,
         },
         items: [item],
      })

      const quiet = await accountDaily?.run(context)

      expect(quiet).toMatchObject({ items: [item] })
      expect(quiet).not.toHaveProperty('summary')
      await expect(accountDaily?.run(context)).resolves.toBeUndefined()
   })
})
