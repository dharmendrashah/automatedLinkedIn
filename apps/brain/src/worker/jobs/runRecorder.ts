import { type JobRunInput } from 'database'

type Log = { error: (message: string) => void }

type Options = {
   flushMs?: number
   // The oldest runs are dropped past this, so a long outage cannot fill the memory.
   maxBuffered?: number
}

const FLUSH_MS = 5000
const MAX_BUFFERED = 10_000
const BATCH = 2000
const LOG_EVERY_MS = 60_000

// Collects the finished runs of the jobs and saves them in batches, so a job that ticks every 5 seconds costs no insert a
// tick. A save that fails never reaches a job: the runs wait for the next flush.
export class RunRecorder {
   private readonly save: (runs: JobRunInput[]) => Promise<void>

   private readonly log: Log

   private readonly flushMs: number

   private readonly maxBuffered: number

   private buffer: JobRunInput[] = []

   private timer: NodeJS.Timeout | undefined

   private flushing: Promise<void> | undefined

   private lastLoggedAt = 0

   public constructor(save: (runs: JobRunInput[]) => Promise<void>, log: Log = console, options: Options = {}) {
      this.save = save
      this.log = log
      this.flushMs = options.flushMs ?? FLUSH_MS
      this.maxBuffered = options.maxBuffered ?? MAX_BUFFERED
   }

   public add(run: JobRunInput) {
      this.buffer.push(run)

      if (this.buffer.length > this.maxBuffered) {
         this.buffer.splice(0, this.buffer.length - this.maxBuffered)
      }
   }

   public start() {
      this.timer ??= setInterval(() => void this.flush(), this.flushMs)
      this.timer.unref()
   }

   // Saves what is left, once, before the process ends.
   public async stop() {
      clearInterval(this.timer)
      this.timer = undefined
      await this.flush()
   }

   public flush(): Promise<void> {
      this.flushing ??= this.drain().finally(() => {
         this.flushing = undefined
      })

      return this.flushing
   }

   private async drain() {
      while (this.buffer.length > 0) {
         const batch = this.buffer.splice(0, BATCH)

         try {
            await this.save(batch)
         } catch (error) {
            this.buffer.unshift(...batch)
            this.buffer.splice(0, Math.max(0, this.buffer.length - this.maxBuffered))
            this.complain(error)

            return
         }
      }
   }

   private complain(error: unknown) {
      const now = Date.now()

      if (now - this.lastLoggedAt >= LOG_EVERY_MS) {
         this.lastLoggedAt = now
         this.log.error(
            `worker could not save job runs, will try again: ${error instanceof Error ? error.message : 'unknown error'}`
         )
      }
   }
}
