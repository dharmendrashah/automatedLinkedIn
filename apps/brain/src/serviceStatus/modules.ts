import { type CheckResult, REASONS, type StatusModule, dead, live, unknown } from './types'

import { httpCheck, smtpCheck } from './checks'

// What brain reads about the spider worker's Cloud Run job (see CloudRunJob.reading in core).
export type SpiderJobReading = { found: false } | { found: true; ready: boolean; lastRunFailedAt: Date | null }

export type StatusConfig = {
   // An empty address or null removes that module: the deployment does not have it.
   websiteUrl: string
   signInUrl: string
   brainWorkerUrl: string
   spiderApiUrl: string
   // Null where the deployment runs no spider job: the module then says so.
   spiderWorker: (() => Promise<SpiderJobReading>) | null
   // Null where the deployment has no bucket: cloud storage is left out.
   bucketIsReachable: (() => Promise<boolean>) | null
   // Null where the deployment has no public file cache bucket (CDN_GCS_BUCKET): the module is left out.
   fileCacheIsReachable: (() => Promise<boolean>) | null
   smtp: { host: string; port: number; tls: boolean } | null
   ipInfoToken: string
   databaseIsHealthy: () => Promise<boolean>
   brokerIsHealthy: () => Promise<boolean>
}

const APP = 'The app'
const SIGN_IN = 'Sign-in'
const SPIDER = 'The spider'
const OUTSIDE = 'Outside services'

const fromBoolean = (check: () => Promise<boolean>) => async () => {
   try {
      return (await check()) ? live() : dead(REASONS.notAnswering)
   } catch {
      return dead(REASONS.notAnswering)
   }
}

// A lookup of a fixed public address, so no user data leaves. Once a minute keeps it far from any quota.
const IPINFO_URL = 'https://api.ipinfo.io/lite/8.8.8.8'
const IPINFO_TTL_MS = 60_000

// The job is asked at most this often, however many people open the page.
const JOB_TTL_MS = 30_000

// A failed run counts against the job for this long. Cloud Run has no separate "failed to start" state, so a crashed run looks the
// same; after the hour the page is Live again while the job is ready.
const FAILED_RUN_WINDOW_MS = 60 * 60 * 1000

// Live means the job can start a run for a task now: it is ready, and no run failed in the last hour.
const spiderWorkerCheck = (read: (() => Promise<SpiderJobReading>) | null) => async (): Promise<CheckResult> => {
   if (!read) {
      return unknown(REASONS.notSetUp)
   }

   try {
      const job = await read()

      if (!job.found) {
         return dead(REASONS.noJob)
      }

      if (!job.ready) {
         return dead(REASONS.notReady)
      }

      const failedRecently =
         job.lastRunFailedAt !== null && Date.now() - job.lastRunFailedAt.getTime() < FAILED_RUN_WINDOW_MS

      return failedRecently ? dead(REASONS.lastRunFailed) : live()
   } catch {
      return unknown(REASONS.cannotAskGoogle)
   }
}

// Every module that needs a check of its own. Anything else running in the cluster is found by discovery, with no code.
// `workload` names the Kubernetes workload a module covers, so discovery does not add a second card for it.
export const buildModules = (config: StatusConfig): StatusModule[] => {
   const modules: Array<StatusModule | false> = [
      Boolean(config.websiteUrl) && {
         key: 'website',
         group: APP,
         name: 'Website',
         description: 'The page you are looking at',
         workload: 'body',
         check: httpCheck(config.websiteUrl),
      },
      {
         key: 'api',
         group: APP,
         name: 'API',
         description: 'Everything the app asks for',
         workload: 'brain',
         // It is the one answering.
         check: async () => live(),
      },
      {
         key: 'database',
         group: APP,
         name: 'Database',
         description: 'Where accounts and sessions are kept',
         check: fromBoolean(config.databaseIsHealthy),
      },
      Boolean(config.brainWorkerUrl) && {
         key: 'brainWorker',
         group: APP,
         name: 'Background worker',
         description: "Applies the spider's answers and runs the daily jobs. Without it a check stays Pending",
         workload: 'brain-worker',
         // Healthy means the database answers and every queue it consumes is connected.
         check: httpCheck(config.brainWorkerUrl),
      },
      config.fileCacheIsReachable !== null && {
         key: 'fileCache',
         group: APP,
         name: 'File cache',
         description:
            'Keeps copies of pictures and videos from other sites (GET /cdn), so they still show when their links end',
         check: fromBoolean(config.fileCacheIsReachable),
      },
      Boolean(config.signInUrl) && {
         key: 'signIn',
         group: SIGN_IN,
         name: 'Sign-in',
         description: 'Logging in and signing up',
         workload: 'authentik-server',
         check: httpCheck(config.signInUrl),
      },
      config.smtp !== null && {
         key: 'email',
         group: SIGN_IN,
         name: 'Email',
         description: 'Sends sign-up and password e-mails. Checks the server is there, not the key',
         check: smtpCheck(config.smtp),
      },
      {
         key: 'queue',
         group: SPIDER,
         name: 'Message queue',
         description: 'Passes work to the spider',
         workload: 'rabbitmq',
         check: fromBoolean(config.brokerIsHealthy),
      },
      Boolean(config.spiderApiUrl) && {
         key: 'spiderApi',
         group: SPIDER,
         name: 'Spider API',
         description: 'Takes scraping tasks',
         workload: 'spider-api',
         check: httpCheck(config.spiderApiUrl),
      },
   ]

   modules.push({
      key: 'spiderWorker',
      group: SPIDER,
      name: 'Spider worker',
      description:
         'The browser that checks LinkedIn accounts. Live means it is ready to start a run when a task is asked for',
      ttlMs: JOB_TTL_MS,
      check: spiderWorkerCheck(config.spiderWorker),
   })

   if (config.bucketIsReachable !== null) {
      modules.push({
         key: 'storage',
         group: SPIDER,
         name: 'Cloud storage',
         description: 'Where the spider keeps sessions and recordings',
         check: fromBoolean(config.bucketIsReachable),
      })
   }

   modules.push({
      key: 'proxyLookup',
      group: OUTSIDE,
      name: 'Proxy lookup',
      description: 'ipinfo.io, which finds the country of a proxy',
      ttlMs: IPINFO_TTL_MS,
      check: httpCheck(IPINFO_URL, { authorization: `Bearer ${config.ipInfoToken}` }),
   })

   return modules.filter((module): module is StatusModule => module !== false)
}

// The workloads the modules above check in their own way.
export const coveredWorkloads = (modules: StatusModule[]) =>
   new Set(modules.flatMap(({ workload }) => (workload ? [workload] : [])))
