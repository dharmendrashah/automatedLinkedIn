import { type ConfirmChannel } from 'amqplib'
import { type Server } from 'node:http'
import { type AddressInfo } from 'node:net'

import { type WorkerConfig } from './config'
import { ConsumerRunner } from './consumers/consumerRunner'
import { deadDepths } from './consumers/deadQueue'
import { type ConsumerDefinition } from './consumers/defineConsumer'
import { createHealthReader, listenHealth } from './health/workerHealth'
import { type JobDefinition } from './jobs/defineJob'
import { JobRunner } from './jobs/jobRunner'
import { type RunRecorder } from './jobs/runRecorder'

type Log = { info: (message: string) => void; error: (message: string) => void }

export type RuntimeDependencies = {
   consumers: ConsumerDefinition[]
   jobs: JobDefinition[]
   openChannel: () => Promise<ConfirmChannel>
   isDatabaseHealthy: () => Promise<boolean>
   isBrokerHealthy: () => Promise<boolean>
   taskDispatch: () => Promise<{ waiting: number; oldestSeconds: number }>
   build: { commit: string; builtAt: string }
   // Saves every finished run of a job for the cron monitor, and tells it what the jobs are. Both are optional so a test can leave them out.
   recorder?: RunRecorder
   announceJobs?: (jobs: JobDefinition[]) => Promise<void>
   log?: Log
   // How often to ask again while the database is not there yet.
   databasePollMs?: number
}

const DATABASE_POLL_MS = 2000

// The brain worker: starts what its roles select, answers GET /health, and stops everything in order. It knows no queue
// and no job by name; those come in as definitions, so the framework never changes when a task or a job is added.
export class WorkerRuntime {
   private readonly config: WorkerConfig

   private readonly dependencies: RuntimeDependencies

   private readonly log: Log

   private readonly consumers: ConsumerRunner[]

   private readonly jobs: JobRunner[]

   private server: Server | undefined

   private stopped = false

   public constructor(config: WorkerConfig, dependencies: RuntimeDependencies) {
      this.config = config
      this.dependencies = dependencies
      this.log = dependencies.log ?? console
      this.consumers = config.roles.has('consumers')
         ? dependencies.consumers.map(
              definition =>
                 new ConsumerRunner(definition, {
                    openChannel: dependencies.openChannel,
                    log: this.log,
                 })
           )
         : []
      this.jobs = config.roles.has('jobs')
         ? dependencies.jobs.map(
              definition => new JobRunner(definition, this.log, run => dependencies.recorder?.add(run))
           )
         : []
   }

   // Resolves once everything it should run has been started. Consumers keep trying on their own if the broker is down.
   public async start() {
      const { dependencies } = this
      const queues = this.consumers.map(runner => runner.state().queue)

      const read = createHealthReader({
         consumers: () => this.consumers.map(runner => runner.state()),
         jobs: () => this.jobs.map(runner => runner.state()),
         isDatabaseHealthy: dependencies.isDatabaseHealthy,
         isBrokerHealthy: dependencies.isBrokerHealthy,
         deadLetters: () => (queues.length > 0 ? deadDepths(queues, dependencies.openChannel) : Promise.resolve([])),
         taskDispatch: dependencies.taskDispatch,
         build: dependencies.build,
      })

      this.server = await listenHealth(read, this.config.healthPort)

      await this.waitForDatabase()

      if (this.stopped) {
         return
      }

      await Promise.all(this.consumers.map(runner => runner.start()))

      if (this.jobs.length > 0) {
         await this.announce()
         dependencies.recorder?.start()
      }

      for (const job of this.jobs) {
         job.start()
      }

      this.log.info(`brain worker started, roles: ${[...this.config.roles].join(', ')}`)
   }

   // The port /health answers on; differs from the configured one only when that is 0 (any free port).
   public healthPort() {
      return (this.server?.address() as AddressInfo | null)?.port
   }

   public async stop() {
      const { shutdownGraceMs } = this.config

      this.stopped = true

      await Promise.all([
         ...this.consumers.map(runner => runner.stop(shutdownGraceMs)),
         ...this.jobs.map(runner => runner.stop(shutdownGraceMs)),
      ])

      // After the jobs have ended, so their last runs are saved too.
      await this.dependencies.recorder?.stop()

      const { server } = this

      if (server) {
         await new Promise<void>(resolve => {
            server.close(() => resolve())
            server.closeAllConnections()
         })
      }
   }

   // Tells the cron monitor what the jobs are. The jobs run without it, so a failure is only logged.
   private async announce() {
      try {
         await this.dependencies.announceJobs?.(this.dependencies.jobs)
      } catch (error) {
         this.log.error(
            `The brain worker could not announce its jobs: ${error instanceof Error ? error.message : 'unknown error'}`
         )
      }
   }

   // The schema is migrated by brain's init container, and a worker that starts first must not apply messages to nothing.
   private async waitForDatabase() {
      const pollMs = this.dependencies.databasePollMs ?? DATABASE_POLL_MS
      let announced = false

      while (!this.stopped && !(await this.dependencies.isDatabaseHealthy().catch(() => false))) {
         if (!announced) {
            this.log.error('The database is not answering yet; the brain worker waits for it')
            announced = true
         }

         await new Promise<void>(resolve => {
            setTimeout(resolve, pollMs)
         })
      }
   }
}
