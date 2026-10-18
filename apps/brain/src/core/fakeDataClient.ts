import { vi } from 'vitest'

import { type CollectOutcome } from './dataClient'

type Answer = Pick<CollectOutcome, 'rows' | 'costMicros'> & Partial<Pick<CollectOutcome, 'status' | 'error'>>

// The data service for tests: each job ends when looked at with what `answer` gives, or keeps running while it gives
// null.
export const fakeDataClient = (answer: (slug: string, params: Record<string, unknown>) => Answer | null) => {
   const jobs = new Map<string, { slug: string; params: Record<string, unknown> }>()

   return {
      balanceMicros: vi.fn(async () => 50_000_000),
      findJob: vi.fn(async (): Promise<string | null> => null),
      cancel: vi.fn(async () => undefined),
      start: vi.fn(async (slug: string, params: Record<string, unknown>) => {
         const jobId = `job-${jobs.size + 1}`

         jobs.set(jobId, {
            slug,
            params,
         })

         return jobId
      }),
      check: vi.fn(async (jobId: string): Promise<CollectOutcome | null> => {
         const job = jobs.get(jobId)
         const answered = job ? answer(job.slug, job.params) : null

         return answered
            ? {
                 jobId,
                 status: 'completed',
                 error: null,
                 ...answered,
              }
            : null
      }),
   }
}
