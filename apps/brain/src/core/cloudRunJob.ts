import { ExecutionsClient, JobsClient } from '@google-cloud/run'

import { CLOUD_RUN_JOB } from 'env'

import { TASK_QUEUE } from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'

// Cloud Run lists the newest executions first. A running execution missed because it is older than this page can only
// cause one extra start, and that execution exits at once when the queue is empty.
const PAGE_SIZE = 100

// gRPC's NOT_FOUND: the job does not exist.
const NOT_FOUND = 5

type StartResult = { started: number }

export type JobReading = { found: false } | { found: true; ready: boolean; lastRunFailedAt: Date | null }

// Starts one Cloud Run execution of the spider worker for each task waiting in the queue that no running execution will take
// (.plan/spider-worker-cloud-run.md). Each execution takes one task and exits, so a running one covers one waiting task.
export class CloudRunJob {
   private static jobs?: JobsClient

   private static executions?: ExecutionsClient

   // Starts run one after another in this process, so each one counts the executions the one before it started.
   private static turn: Promise<unknown> = Promise.resolve()

   // Never throws: a start that fails is logged and tried again by the next call, which the task-dispatch job makes.
   public static start(): Promise<StartResult> {
      if (!CLOUD_RUN_JOB) {
         return Promise.resolve({ started: 0 })
      }

      const run = this.turn.then(() => this.launch())

      this.turn = run.catch(() => undefined)

      return run.catch((error: unknown) => {
         console.error(`Could not start a spider job: ${(error as Error).name}`)

         return { started: 0 }
      })
   }

   // What the Service status page shows: whether the job exists, whether it is ready, and when its latest run failed (if it did).
   // Other errors are thrown, so the page can say that Google Cloud could not be asked.
   public static async reading(): Promise<JobReading> {
      try {
         const [job] = await this.jobClient().getJob({ name: CLOUD_RUN_JOB })
         const latest = job.latestCreatedExecution
         const failed = latest?.completionStatus === 'EXECUTION_FAILED' ? latest.completionTime : null

         return {
            found: true,
            ready: job.terminalCondition?.state === 'CONDITION_SUCCEEDED',
            lastRunFailedAt: failed
               ? new Date(Number(failed.seconds) * 1000 + Math.floor((failed.nanos ?? 0) / 1e6))
               : null,
         }
      } catch (error) {
         if (typeof error === 'object' && error !== null && 'code' in error && error.code === NOT_FOUND) {
            return { found: false }
         }

         throw error
      }
   }

   private static async launch(): Promise<StartResult> {
      const waiting = await MessageBroker.readyCount(TASK_QUEUE)

      if (waiting === 0) {
         return { started: 0 }
      }

      const missing = waiting - (await this.running())

      for (let index = 0; index < missing; index += 1) {
         await this.jobClient().runJob({ name: CLOUD_RUN_JOB })
      }

      if (missing > 0) {
         console.log(`Started ${missing} spider job execution(s) for ${waiting} waiting task(s).`)
      }

      return { started: Math.max(missing, 0) }
   }

   // An execution without a completion time is running or starting.
   private static async running() {
      const [executions] = await this.executionClient().listExecutions(
         {
            parent: CLOUD_RUN_JOB,
            pageSize: PAGE_SIZE,
         },
         { autoPaginate: false }
      )

      return executions.filter(({ completionTime }) => !completionTime).length
   }

   private static jobClient() {
      this.jobs ??= new JobsClient()

      return this.jobs
   }

   private static executionClient() {
      this.executions ??= new ExecutionsClient()

      return this.executions
   }
}
