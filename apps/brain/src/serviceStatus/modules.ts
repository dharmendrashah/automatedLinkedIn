import { REASONS, type StatusModule, dead, live, unknown } from './types'

import { httpCheck, smtpCheck, workerReport } from './checks'

export type StatusConfig = {
   // An empty address or null removes that module: the deployment does not have it.
   websiteUrl: string
   signInUrl: string
   spiderApiUrl: string
   spiderWorkerUrl: string
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

   if (config.spiderWorkerUrl) {
      // The worker is the one with Google credentials and no web address of its own, so one report tells both.
      const report = workerReport(config.spiderWorkerUrl)

      modules.push(
         {
            key: 'spiderWorker',
            group: SPIDER,
            name: 'Spider worker',
            description: 'The browser that checks LinkedIn accounts. Live means it is connected and waiting for work',
            workload: 'spider-worker',
            check: async () => {
               const read = await report()

               if (!read.reachable) {
                  return dead(read.reason)
               }

               return read.broker === 'up' && read.consuming ? live() : dead(REASONS.error)
            },
         },
         {
            key: 'storage',
            group: SPIDER,
            name: 'Cloud storage',
            description: 'Where the spider keeps sessions and recordings',
            check: async () => {
               const read = await report()

               if (!read.reachable) {
                  return unknown(REASONS.workerUnreachable)
               }

               return read.storage === 'up' ? live() : dead(REASONS.error)
            },
         }
      )
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
