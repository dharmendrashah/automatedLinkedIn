import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JOBS } from './registry'

const mocks = vi.hoisted(() => ({ runDue: vi.fn() }))

vi.mock('database', () => ({ ProxyScoringJob: { runDue: mocks.runDue } }))

const [proxyScoring] = JOBS
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
})
