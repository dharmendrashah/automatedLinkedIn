import 'dotenv/config'

import { TASK_QUEUE, taskCommandSchema } from '@automatedLinkedIn/contracts'

import {
   GIT_SHA,
   LINKEDIN_CRED_ENC_KEY,
   RABBITMQ_URL,
   SPIDER_ACCOUNT_BUSY_DELAY_MS,
   SPIDER_ACCOUNT_LOCK_TTL_MS,
   SPIDER_ACTION_TIMEOUT_MS,
   SPIDER_ALLOWED_HOSTS,
   SPIDER_GCS_BUCKET,
   SPIDER_HEADLESS,
   SPIDER_LINKEDIN_BASE_URL,
   SPIDER_MAX_RECORDS,
   SPIDER_MIN_DELAY_MS,
   SPIDER_RECORDING,
   SPIDER_RECORD_VIDEO,
   SPIDER_ROBOTS_EXEMPT_HOSTS,
   SPIDER_ROBOTS_USER_AGENT,
   SPIDER_VALIDATION_MODE,
   SPIDER_WORKER_HEALTH_PORT,
} from './env'
import { createWorkerHealth, startHealthServer } from './health/workerHealth'
import { Broker } from './messaging/broker'
import { consumeQueue, consumeTasks } from './messaging/consumer'
import { publishCatalog, publishResult, publishRunResult, republishRun, republishTask } from './messaging/publisher'
import { assertTopology } from './messaging/topology'
import { Recorder } from './recording/recorder'
import { AccountLock } from './scraping/accountLock'
import { CamoufoxDriver } from './scraping/camoufoxDriver'
import { ScrapeEngine } from './scraping/engine'
import { Mutex } from './scraping/mutex'
import { HostPolicy } from './scraping/policy'
import { processTask } from './scraping/processTask'
import { HostRateLimiter } from './scraping/rateLimiter'
import { RobotsGuard } from './scraping/robots'
import { GcsStore } from './storage/gcsStore'
import { catalogOf } from './tasks/catalog'
import { openCredentials } from './tasks/credentials'
import { AccountValidator } from './tasks/linkedinLogin/accountValidator'
import { buildTasks } from './tasks/registry'
import { exhaustedResult, runTask } from './tasks/runner'

const main = async () => {
   if (Buffer.from(LINKEDIN_CRED_ENC_KEY, 'base64').length !== 32) {
      throw new Error('LINKEDIN_CRED_ENC_KEY must be a base64-encoded 32-byte key, the same one brain uses')
   }

   const policy = HostPolicy.fromList(SPIDER_ALLOWED_HOSTS, SPIDER_ROBOTS_EXEMPT_HOSTS)
   const store = new GcsStore(SPIDER_GCS_BUCKET)
   const broker = new Broker(RABBITMQ_URL)
   const accountLock = new AccountLock(store, SPIDER_ACCOUNT_LOCK_TTL_MS)
   const limiter = new HostRateLimiter(SPIDER_MIN_DELAY_MS)
   // Scrape tasks and every other task each open a Firefox, so this worker does one of them at a time.
   const oneBrowser = new Mutex()
   const recordingMode = SPIDER_RECORDING
   // Off by default for tasks that do not insist on it: a recording holds what the browser showed.
   if (!policy.allowsUrl(SPIDER_LINKEDIN_BASE_URL)) {
      console.error(
         `${SPIDER_LINKEDIN_BASE_URL} is not in SPIDER_ALLOWED_HOSTS: LinkedIn sign-in checks will report an error`
      )
   }

   const driver = new CamoufoxDriver({
      actionTimeoutMs: SPIDER_ACTION_TIMEOUT_MS,
      isAllowedNavigation: url => policy.allowsUrl(url),
      headless: SPIDER_HEADLESS === 'virtual' ? 'virtual' : true,
   })

   const engine = new ScrapeEngine({
      driver,
      policy,
      robots: new RobotsGuard(SPIDER_ROBOTS_USER_AGENT),
      limiter,
      store,
      maxRecords: SPIDER_MAX_RECORDS,
   })

   const tasks = buildTasks({
      linkedin: {
         validator: new AccountValidator({
            baseUrl: SPIDER_LINKEDIN_BASE_URL,
            mode: SPIDER_VALIDATION_MODE,
            pause: host => limiter.wait(host),
            allowsCookieDomain: domain => policy.allowsCookieDomain(domain),
         }),
         baseUrl: SPIDER_LINKEDIN_BASE_URL,
      },
   })

   const channel = await broker.consumeChannel()
   const taskChannel = await broker.consumeChannel()

   await assertTopology(channel)

   const consumer = await consumeTasks(
      channel,
      command =>
         oneBrowser.runExclusive(() =>
            processTask(command, {
               engine,
               store,
               accountLock,
               publishResult: async result => publishResult(await broker.publishChannel(), result),
            })
         ),
      {
         republish: async (message, retries) => republishTask(await broker.publishChannel(), message, retries),
         busyDelayMs: SPIDER_ACCOUNT_BUSY_DELAY_MS,
      }
   )

   // Every task of the standard contract runs here: the runner records it, applies the limits and answers.
   const taskConsumer = await consumeQueue(
      taskChannel,
      {
         queue: TASK_QUEUE,
         parse: content => taskCommandSchema.parse(JSON.parse(content.toString())),
         label: command => `Task ${command.task} ${command.task_id}`,
         handler: command =>
            oneBrowser.runExclusive(() =>
               runTask(command, {
                  tasks,
                  driver,
                  policy,
                  robots: new RobotsGuard(SPIDER_ROBOTS_USER_AGENT),
                  limiter,
                  store,
                  accountLock,
                  openCredentials: sealed => openCredentials(sealed, LINKEDIN_CRED_ENC_KEY),
                  startRecording: ({ task, id, prefix, always, videoSize }) =>
                     always || recordingMode !== 'off'
                        ? Recorder.start({
                             kind: task,
                             id,
                             prefix,
                             mode: always ? 'always' : (recordingMode as 'failures' | 'always'),
                             video: SPIDER_RECORD_VIDEO,
                             ...(videoSize && { videoSize }),
                             store,
                          })
                        : Promise.resolve(undefined),
                  publishResult: async result => publishRunResult(await broker.publishChannel(), result),
                  workerBuild: GIT_SHA,
               })
            ),
         // A session must never stay in progress because the worker kept failing: brain gets an answer instead.
         onExhausted: async command =>
            publishRunResult(await broker.publishChannel(), exhaustedResult(command, GIT_SHA)),
      },
      {
         republish: async (message, retries) => republishRun(await broker.publishChannel(), message, retries),
         busyDelayMs: SPIDER_ACCOUNT_BUSY_DELAY_MS,
      }
   )

   // Brain keeps the latest, so a worker that starts later or newer simply replaces what brain knew.
   await publishCatalog(await broker.publishChannel(), catalogOf(tasks, GIT_SHA))

   let stopping = false

   // What the Service status page reads: connected to the queue and consuming both queues, and able to read the bucket.
   const consuming = () => !stopping

   startHealthServer(
      SPIDER_WORKER_HEALTH_PORT,
      createWorkerHealth({
         brokerIsUp: () => broker.isHealthy(),
         isConsuming: consuming,
         checkStorage: async () => {
            await store.ping()

            return true
         },
      })
   )

   // A lost connection ends the process, so the container's restart policy brings a clean worker back.
   for (const open of [channel, taskChannel]) {
      open.on('close', () => {
         if (!stopping) {
            console.error('The broker channel closed; exiting so the worker restarts')
            process.exit(1)
         }
      })
   }

   for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
         stopping = true

         // Finish the task in progress, take no new one, then leave.
         Promise.all([consumer.stop(), taskConsumer.stop()])
            .then(() => broker.close())
            .finally(() => process.exit(0))
      })
   }

   console.log('spider worker is waiting for tasks')
}

main().catch((error: unknown) => {
   console.error(`spider worker could not start: ${error instanceof Error ? error.message : 'unknown error'}`)
   process.exit(1)
})
