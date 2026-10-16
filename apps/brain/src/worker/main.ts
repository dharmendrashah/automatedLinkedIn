import 'dotenv/config'

import '../aliases'

import { MessageBroker } from 'core'

import { BUILD_TIME, GIT_SHA, WORKER_HEALTH_PORT, WORKER_ROLES, WORKER_SHUTDOWN_GRACE_MS } from 'env'

import { PrismaService, TaskDispatchService } from 'database'

import { createWorkerConfig } from './config'
import { CONSUMERS } from './consumers/registry'
import { JOBS } from './jobs/registry'
import { WorkerRuntime } from './runtime'

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
            console.log('brain worker stopped, database and broker connections closed')
         })
         .finally(() => {
            process.exit(0)
         })
   )
}

runtime.start().catch((error: unknown) => {
   console.error(`The brain worker could not start: ${error instanceof Error ? error.message : 'unknown error'}`)
   process.exit(1)
})
