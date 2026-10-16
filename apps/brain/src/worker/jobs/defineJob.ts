export type JobContext = {
   // Aborted at the timeout. A job that can stop early should.
   signal: AbortSignal
}

// What a job returns when it did something worth a log line. Nothing when there was nothing to do: staging's idle checker
// counts log lines as activity, so a quiet hour must write none.
export type JobOutcome = { summary: string } | undefined

export type JobDefinition = {
   // Permanent: logs and health use it.
   name: string
   everyMs: number
   // The first run waits this long after the worker started.
   startAfterMs?: number
   timeoutMs: number
   // Must be safe to run again right after a run that was cut off, and in more than one replica at once.
   run: (context: JobContext) => Promise<JobOutcome | void>
}

export const defineJob = (definition: JobDefinition) => definition
