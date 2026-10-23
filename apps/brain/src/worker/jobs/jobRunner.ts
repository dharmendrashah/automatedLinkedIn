import { type JobRunInput } from 'database'

import { type JobDefinition } from './defineJob'

type Log = { info: (message: string) => void; error: (message: string) => void }

type Report = Pick<JobRunInput, 'outcome' | 'summary' | 'counts' | 'items' | 'error'>

export type JobState = {
   name: string
   running: boolean
   runs: number
   lastStartedAt: string | null
   lastFinishedAt: string | null
   lastOutcome: 'ok' | 'failed' | 'timed-out' | null
   failureStreak: number
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : 'unknown error')

// Runs one job on its interval. A tick that finds the job still running is skipped, a job that throws never takes the
// process down, and the timeout aborts the job's signal. A job that ignores its signal keeps the guard until it ends, so
// two runs of one job never overlap.
export class JobRunner {
   private readonly definition: JobDefinition

   private readonly log: Log

   private readonly record: ((run: JobRunInput) => void) | undefined

   private timer: NodeJS.Timeout | undefined

   private current: Promise<void> | undefined

   private stopped = false

   private runs = 0

   private lastStartedAt: string | null = null

   private lastFinishedAt: string | null = null

   private lastOutcome: JobState['lastOutcome'] = null

   private failureStreak = 0

   public constructor(definition: JobDefinition, log: Log = console, record?: (run: JobRunInput) => void) {
      this.definition = definition
      this.log = log
      this.record = record
   }

   public state(): JobState {
      return {
         name: this.definition.name,
         running: this.current !== undefined,
         runs: this.runs,
         lastStartedAt: this.lastStartedAt,
         lastFinishedAt: this.lastFinishedAt,
         lastOutcome: this.lastOutcome,
         failureStreak: this.failureStreak,
      }
   }

   public start() {
      if (this.timer || this.stopped) {
         return
      }

      this.timer = setTimeout(() => this.tick(), this.definition.startAfterMs ?? this.definition.everyMs)
   }

   // Waits up to `graceMs` for a run in progress.
   public async stop(graceMs: number) {
      this.stopped = true
      clearTimeout(this.timer)
      this.timer = undefined

      let timer: NodeJS.Timeout | undefined

      await Promise.race([
         this.current,
         new Promise<void>(resolve => {
            timer = setTimeout(resolve, graceMs)
         }),
      ])
      clearTimeout(timer)
   }

   // Starts a run unless one is going. Resolves when the run ends; resolves at once when it was skipped.
   public runNow() {
      if (this.current) {
         return Promise.resolve()
      }

      this.current = this.execute().finally(() => {
         this.current = undefined
      })

      return this.current
   }

   private tick() {
      if (this.stopped) {
         return
      }

      this.timer = setTimeout(() => this.tick(), this.definition.everyMs)
      void this.runNow()
   }

   private async execute() {
      const { name, timeoutMs, run } = this.definition
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
         timedOut = true
         controller.abort()
      }, timeoutMs)

      this.runs += 1
      this.lastStartedAt = new Date().toISOString()

      const startedAt = new Date()
      let report: Report

      try {
         const outcome = await run({ signal: controller.signal })

         this.lastOutcome = timedOut ? 'timed-out' : 'ok'

         if (timedOut) {
            this.failureStreak += 1
            this.log.error(`worker job=${name} ran past its ${timeoutMs} ms limit`)
            report = {
               outcome: 'TIMED_OUT',
               error: `ran past its ${timeoutMs} ms limit`,
            }
         } else {
            this.failureStreak = 0
            report = outcome
               ? {
                    outcome: 'WORKED',
                    summary: outcome.summary,
                    counts: outcome.counts,
                    items: outcome.items,
                 }
               : { outcome: 'IDLE' }

            if (outcome?.summary) {
               this.log.info(`worker job=${name} ${outcome.summary}`)
            }
         }
      } catch (error) {
         this.lastOutcome = timedOut ? 'timed-out' : 'failed'
         this.failureStreak += 1
         this.log.error(`worker job=${name} failed${timedOut ? ' (timed out)' : ''}: ${reasonOf(error)}`)
         report = {
            outcome: timedOut ? 'TIMED_OUT' : 'FAILED',
            error,
         }
      } finally {
         clearTimeout(timer)
         this.lastFinishedAt = new Date().toISOString()
      }

      this.record?.({
         job: name,
         startedAt,
         finishedAt: new Date(),
         ...report,
      })
   }
}
