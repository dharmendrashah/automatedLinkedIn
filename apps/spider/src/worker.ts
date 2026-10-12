import 'dotenv/config'

import { VALIDATE_QUEUE, validateAccountCommandSchema } from '@automatedLinkedIn/contracts'

import {
   LINKEDIN_CRED_ENC_KEY,
   RABBITMQ_URL,
   SPIDER_ACCOUNT_BUSY_DELAY_MS,
   SPIDER_ACCOUNT_LOCK_TTL_MS,
   SPIDER_ACTION_TIMEOUT_MS,
   SPIDER_ALLOWED_HOSTS,
   SPIDER_GCS_BUCKET,
   SPIDER_LINKEDIN_BASE_URL,
   SPIDER_MAX_RECORDS,
   SPIDER_MIN_DELAY_MS,
   SPIDER_RECORDING,
   SPIDER_RECORD_VIDEO,
   SPIDER_ROBOTS_EXEMPT_HOSTS,
   SPIDER_ROBOTS_USER_AGENT,
   SPIDER_VALIDATION_MODE,
} from './env'
import { Broker } from './messaging/broker'
import { consumeQueue, consumeTasks } from './messaging/consumer'
import { publishResult, publishValidationResult, republishTask, republishValidation } from './messaging/publisher'
import { assertTopology } from './messaging/topology'
import { Recorder } from './recording/recorder'
import { AccountLock } from './scraping/accountLock'
import { CamoufoxDriver } from './scraping/camoufoxDriver'
import { ScrapeEngine } from './scraping/engine'
import { HostPolicy } from './scraping/policy'
import { processTask } from './scraping/processTask'
import { HostRateLimiter } from './scraping/rateLimiter'
import { RobotsGuard } from './scraping/robots'
import { GcsStore } from './storage/gcsStore'
import { AccountValidator } from './validation/accountValidator'
import { openCredentials } from './validation/credentials'
import { Mutex } from './validation/mutex'
import { processValidation } from './validation/processValidation'

const main = async () => {
   if (Buffer.from(LINKEDIN_CRED_ENC_KEY, 'base64').length !== 32) {
      throw new Error('LINKEDIN_CRED_ENC_KEY must be a base64-encoded 32-byte key, the same one brain uses')
   }

   const policy = HostPolicy.fromList(SPIDER_ALLOWED_HOSTS, SPIDER_ROBOTS_EXEMPT_HOSTS)
   const store = new GcsStore(SPIDER_GCS_BUCKET)
   const broker = new Broker(RABBITMQ_URL)
   const accountLock = new AccountLock(store, SPIDER_ACCOUNT_LOCK_TTL_MS)
   const limiter = new HostRateLimiter(SPIDER_MIN_DELAY_MS)
   // Scrape tasks and validations each open a Firefox, so this worker does one of them at a time.
   const oneBrowser = new Mutex()
   const recordingMode = SPIDER_RECORDING
   // Off by default: a recording holds what the browser showed, so it is only made when it is switched on.
   const startRecording =
      recordingMode === 'off'
         ? undefined
         : (kind: 'validate' | 'task', id: string) =>
              Recorder.start({
                 kind,
                 id,
                 mode: recordingMode,
                 video: SPIDER_RECORD_VIDEO,
                 store,
              })

   if (!policy.allowsUrl(SPIDER_LINKEDIN_BASE_URL)) {
      console.error(
         `${SPIDER_LINKEDIN_BASE_URL} is not in SPIDER_ALLOWED_HOSTS: account validations will report an error`
      )
   }

   const driver = new CamoufoxDriver({
      actionTimeoutMs: SPIDER_ACTION_TIMEOUT_MS,
      isAllowedNavigation: url => policy.allowsUrl(url),
   })

   const engine = new ScrapeEngine({
      driver,
      policy,
      robots: new RobotsGuard(SPIDER_ROBOTS_USER_AGENT),
      limiter,
      store,
      maxRecords: SPIDER_MAX_RECORDS,
   })

   const validator = new AccountValidator({
      baseUrl: SPIDER_LINKEDIN_BASE_URL,
      mode: SPIDER_VALIDATION_MODE,
      pause: host => limiter.wait(host),
      allowsCookieDomain: domain => policy.allowsCookieDomain(domain),
   })

   const channel = await broker.consumeChannel()
   const validationChannel = await broker.consumeChannel()

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

   const validationConsumer = await consumeQueue(
      validationChannel,
      {
         queue: VALIDATE_QUEUE,
         parse: content => validateAccountCommandSchema.parse(JSON.parse(content.toString())),
         label: command => `Validation ${command.validation_id}`,
         handler: command =>
            oneBrowser.runExclusive(() =>
               processValidation(command, {
                  driver,
                  validator,
                  store,
                  accountLock,
                  openCredentials: sealed => openCredentials(sealed, LINKEDIN_CRED_ENC_KEY),
                  startRecording,
                  publishResult: async result => publishValidationResult(await broker.publishChannel(), result),
               })
            ),
         // An account must never stay PENDING because the worker kept failing: brain gets an answer instead.
         onExhausted: async command =>
            publishValidationResult(await broker.publishChannel(), {
               validation_id: command.validation_id,
               account_id: command.account_id,
               outcome: 'ERROR',
               message: 'Verification could not run. Try again later.',
               checked_at: new Date().toISOString(),
            }),
      },
      {
         republish: async (message, retries) => republishValidation(await broker.publishChannel(), message, retries),
         busyDelayMs: SPIDER_ACCOUNT_BUSY_DELAY_MS,
      }
   )

   let stopping = false

   // A lost connection ends the process, so the container's restart policy brings a clean worker back.
   for (const open of [channel, validationChannel]) {
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
         Promise.all([consumer.stop(), validationConsumer.stop()])
            .then(() => broker.close())
            .finally(() => process.exit(0))
      })
   }

   console.log('spider worker is waiting for tasks and account validations')
}

main().catch((error: unknown) => {
   console.error(`spider worker could not start: ${error instanceof Error ? error.message : 'unknown error'}`)
   process.exit(1)
})
