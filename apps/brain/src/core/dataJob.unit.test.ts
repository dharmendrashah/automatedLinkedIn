import { describe, expect, it, vi } from 'vitest'

import { DataServiceError } from './dataClient'
import { RETRY_DELAYS_MS, advanceJob } from './dataJob'

const NOW = new Date('2026-10-18T10:00:00Z')

const clientOf = (overrides: Partial<Parameters<typeof advanceJob>[0]> = {}) => ({
   start: vi.fn(async () => 'job-new'),
   check: vi.fn(async () => null),
   findJob: vi.fn(async () => null),
   cancel: vi.fn(async () => undefined),
   ...overrides,
})

const hooks = () => ({
   sending: vi.fn(async () => undefined),
   started: vi.fn(async () => undefined),
})

const job = (fields: Partial<Parameters<typeof advanceJob>[1]> = {}) => ({
   slug: 'post-comments',
   params: { posts: 'x' },
   jobId: null,
   sentAt: null,
   attempts: 0,
   ...fields,
})

const outcome = (status: 'completed' | 'failed', costMicros: number) => ({
   jobId: 'job-1',
   status,
   rows: status === 'completed' ? [{ a: 1 }] : [],
   costMicros,
   error: status === 'failed' ? 'System error' : null,
})

describe('advanceJob', () => {
   it('should note the send before starting, save the job id, and look at it once at once', async () => {
      const start = vi.fn(async () => 'job-new')
      const check = vi.fn(async () => null)
      const on = hooks()

      await expect(
         advanceJob(
            clientOf({
               start,
               check,
            }),
            job(),
            on,
            NOW
         )
      ).resolves.toEqual({ status: 'running' })
      expect(on.sending.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0] ?? 0)
      expect(on.started).toHaveBeenCalledWith('job-new')
      expect(check).toHaveBeenCalledWith('job-new')
   })

   it('should pick up a job a lost start created instead of paying for a new one', async () => {
      const start = vi.fn(async () => 'job-new')
      const on = hooks()

      await advanceJob(
         clientOf({
            start,
            findJob: vi.fn(async () => 'job-lost'),
         }),
         job({ sentAt: NOW }),
         on,
         NOW
      )

      expect(start).not.toHaveBeenCalled()
      expect(on.started).toHaveBeenCalledWith('job-lost')
   })

   it('should hand back a finished job, even a failed one that was charged', async () => {
      const done = outcome('completed', 2_000)
      const charged = outcome('failed', 1_000)

      await expect(
         advanceJob(clientOf({ check: vi.fn(async () => done) }), job({ jobId: 'job-1' }), hooks(), NOW)
      ).resolves.toEqual({
         status: 'finished',
         outcome: done,
      })
      await expect(
         advanceJob(clientOf({ check: vi.fn(async () => charged) }), job({ jobId: 'job-1' }), hooks(), NOW)
      ).resolves.toEqual({
         status: 'finished',
         outcome: charged,
      })
   })

   it('should retry an uncharged failure from scratch, and a lost answer on the same job', async () => {
      const failed = clientOf({ check: vi.fn(async () => outcome('failed', 0)) })
      const down = clientOf({
         check: vi.fn(async () => {
            throw new DataServiceError('UNAVAILABLE', '502')
         }),
      })

      await expect(
         advanceJob(
            failed,
            job({
               jobId: 'job-1',
               attempts: 1,
            }),
            hooks(),
            NOW
         )
      ).resolves.toEqual({
         status: 'retry',
         at: new Date(NOW.getTime() + (RETRY_DELAYS_MS[1] ?? 0)),
         restart: true,
         error: 'System error',
      })
      await expect(advanceJob(down, job({ jobId: 'job-1' }), hooks(), NOW)).resolves.toMatchObject({
         status: 'retry',
         restart: false,
      })
   })

   it('should cancel a job that ran too long and retry it', async () => {
      const cancel = vi.fn(async () => undefined)

      await expect(
         advanceJob(
            clientOf({ cancel }),
            job({
               jobId: 'job-1',
               sentAt: new Date(NOW.getTime() - 11 * 60_000),
            }),
            hooks(),
            NOW
         )
      ).resolves.toMatchObject({
         status: 'retry',
         restart: true,
      })
      expect(cancel).toHaveBeenCalledWith('job-1')
   })

   it('should give up after the last retry, and never retry a bad request', async () => {
      const failed = clientOf({ check: vi.fn(async () => outcome('failed', 0)) })
      const bad = clientOf({
         start: vi.fn(async () => {
            throw new DataServiceError('BAD_REQUEST', '422')
         }),
      })

      await expect(
         advanceJob(
            failed,
            job({
               jobId: 'job-1',
               attempts: RETRY_DELAYS_MS.length,
            }),
            hooks(),
            NOW
         )
      ).resolves.toEqual({
         status: 'failed',
         error: 'System error',
      })
      await expect(advanceJob(bad, job(), hooks(), NOW)).rejects.toMatchObject({ kind: 'BAD_REQUEST' })
   })
})
