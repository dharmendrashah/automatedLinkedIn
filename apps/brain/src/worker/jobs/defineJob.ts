import { type JobItemInput } from 'database'

export type JobContext = {
   // Aborted at the timeout. A job that can stop early should.
   signal: AbortSignal
}

// What a job returns when it did something worth a log line. Nothing when it was idle: staging's idle checker counts log lines
// as activity, so a quiet run must write none (the cron monitor still records it as idle). `counts` and `items` are for the
// monitor only: how many, and which accounts were handled or left and why.
export type JobOutcome = { summary?: string; counts?: Record<string, number>; items?: JobItemInput[] } | undefined

export type JobDefinition = {
   // Permanent: logs and health use it.
   name: string
   // What the cron monitor shows: a short title and one plain sentence on what the job does.
   title: string
   purpose: string
   everyMs: number
   // The first run waits this long after the worker started.
   startAfterMs?: number
   timeoutMs: number
   // Must be safe to run again right after a run that was cut off, and in more than one replica at once.
   run: (context: JobContext) => Promise<JobOutcome | void>
}

export const defineJob = (definition: JobDefinition) => definition
