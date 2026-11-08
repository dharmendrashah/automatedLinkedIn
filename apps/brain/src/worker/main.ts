import { hostname } from 'node:os'

import 'dotenv/config'

import '../aliases'

import { MessageBroker } from 'core'

import { BUILD_TIME, GIT_SHA, WORKER_HEALTH_PORT, WORKER_ROLES, WORKER_SHUTDOWN_GRACE_MS } from 'env'

import { JobRunService, PrismaService, TaskDispatchService } from 'database'

import { createLogger } from '@automatedLinkedIn/logger'

import { createWorkerConfig } from './config'
import { CONSUMERS } from './consumers/registry'
import { JOBS } from './jobs/registry'
import { RunRecorder } from './jobs/runRecorder'
import { WorkerRuntime } from './runtime'

const instance = hostname()
const log = createLogger({ service: 'brain:worker' })

const runtime = new WorkerRuntime(
   createWorkerConfig({
      roles: WORKER_ROLES,
      healthPort: WORKER_HEALTH_PORT,
      shutdownGraceMs: WORKER_SHUTDOWN_GRACE_MS,
   }),
   {
      consumers: CONSUMERS,
      jobs: JOBS,
      openChannel: () => MessageBroker.confirmedChannel(),
      isDatabaseHealthy: () => PrismaService.isHealthy(),
      isBrokerHealthy: () => MessageBroker.isHealthy(),
      taskDispatch: () => TaskDispatchService.waiting(),
      log,
      recorder: new RunRecorder(runs =>
         JobRunService.recordMany(runs, {
            instance,
            build: GIT_SHA,
         })
      ),
      announceJobs: jobs =>
         JobRunService.announce(
            jobs.map(({ name, title, purpose, everyMs, timeoutMs }) => ({
               name,
               title,
               purpose,
               everyMs,
               timeoutMs,
            }))
         ),
      build: {
         commit: GIT_SHA,
         builtAt: BUILD_TIME,
      },
   }
)

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      runtime
         .stop()
         .then(() => Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()]))
         .then(() => {
            log.info('Brain worker stopped; database and broker connections closed')
         })
         .finally(() => {
            process.exit(0)
         })
   )
}

runtime.start().catch((error: unknown) => {
   log.error('The brain worker could not start', { error })
   process.exit(1)
})
