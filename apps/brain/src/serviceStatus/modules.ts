import { REASONS, type StatusModule, dead, live, unknown } from './types'

import { deploymentCheck, httpCheck, smtpCheck, workerReport } from './checks'

export type StatusConfig = {
   // An empty address, deployment name or null removes that module: the deployment does not have it.
   websiteUrl: string
   signInUrl: string
   spiderApiUrl: string
   spiderWorkerUrl: string
   authentikWorkerDeployment: string
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

// Every module the product needs to work. The groups and descriptions are what the status page shows.
export const buildModules = (config: StatusConfig): StatusModule[] => {
   const modules: Array<StatusModule | false> = [
      Boolean(config.websiteUrl) && {
         key: 'website',
         group: APP,
         name: 'Website',
         description: 'The page you are looking at',
         check: httpCheck(config.websiteUrl),
      },
      {
         key: 'api',
         group: APP,
         name: 'API',
         description: 'Everything the app asks for',
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
         check: httpCheck(config.signInUrl),
      },
      Boolean(config.authentikWorkerDeployment) && {
         key: 'signInWorker',
         group: SIGN_IN,
         name: 'Sign-in worker',
         description: 'Background work for sign-in',
         check: deploymentCheck(config.authentikWorkerDeployment),
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
         check: fromBoolean(config.brokerIsHealthy),
      },
      Boolean(config.spiderApiUrl) && {
         key: 'spiderApi',
         group: SPIDER,
         name: 'Spider API',
         description: 'Takes scraping tasks',
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
