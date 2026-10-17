import { type CollectOutcome, type DataClient, DataServiceError, RESULT_TIMEOUT_MS } from './dataClient'

// One step of a paid request that never waits: start it, or look at the job once. A request that failed without a
// charge is tried again later; one that cost money is never sent twice. The caller saves what this returns.

// The pauses before each retry: 1, 2, 5, 15 and 30 minutes, then the request has failed.
export const RETRY_DELAYS_MS = [1, 2, 5, 15, 30].map(minutes => minutes * 60_000)

type Client = Pick<DataClient, 'start' | 'check' | 'findJob' | 'cancel'>

export type JobState = {
   slug: string
   params: Record<string, unknown>
   jobId: string | null
   // Set just before a start is sent, so a start whose answer was lost is looked up instead of sent again.
   sentAt: Date | null
   attempts: number
}

export type JobStep =
   | { status: 'running' }
   | { status: 'finished'; outcome: CollectOutcome }
   // `restart` drops the job (it failed); otherwise the same job, or the same lost start, is looked at again.
   | { status: 'retry'; at: Date; restart: boolean; error: string }
   | { status: 'failed'; error: string }

type Hooks = {
   sending: () => Promise<void>
   started: (jobId: string) => Promise<void>
}

const again = (job: JobState, error: string, restart: boolean, now: Date): JobStep => {
   const delay = RETRY_DELAYS_MS[job.attempts]

   return delay === undefined
      ? {
           status: 'failed',
           error,
        }
      : {
           status: 'retry',
           at: new Date(now.getTime() + delay),
           restart,
           error,
        }
}

const look = async (client: Client, job: JobState, jobId: string, now: Date): Promise<JobStep> => {
   const outcome = await client.check(jobId)

   if (!outcome) {
      if (job.sentAt && now.getTime() - job.sentAt.getTime() > RESULT_TIMEOUT_MS) {
         await client.cancel(jobId).catch(() => undefined)

         return again(job, 'The job did not finish in time', true, now)
      }

      return { status: 'running' }
   }

   if ((outcome.status === 'failed' || outcome.status === 'cancelled') && outcome.costMicros === 0) {
      return again(job, outcome.error ?? outcome.status, true, now)
   }

   return {
      status: 'finished',
      outcome,
   }
}

// Throws what must not be retried: a refused key, an empty wallet, a bad request.
export const advanceJob = async (client: Client, job: JobState, hooks: Hooks, now = new Date()): Promise<JobStep> => {
   try {
      if (job.jobId) {
         return await look(client, job, job.jobId, now)
      }

      const lost = job.sentAt ? await client.findJob(job.slug, job.sentAt) : null

      if (lost) {
         await hooks.started(lost)

         return await look(client, job, lost, now)
      }

      await hooks.sending()

      const jobId = await client.start(job.slug, job.params)

      await hooks.started(jobId)

      return await look(
         client,
         {
            ...job,
            sentAt: now,
         },
         jobId,
         now
      )
   } catch (error) {
      if (error instanceof DataServiceError && error.kind === 'UNAVAILABLE') {
         return again(job, error.message, false, now)
      }

      throw error
   }
}
