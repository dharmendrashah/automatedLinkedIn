import { MessageBroker } from 'core'

import {
   AUTHENTIK_EMAIL__HOST,
   AUTHENTIK_EMAIL__PORT,
   AUTHENTIK_EMAIL__USE_SSL,
   IPINFO_TOKEN,
   STATUS_URL_BRAIN_WORKER,
   STATUS_URL_SIGN_IN,
   STATUS_URL_SPIDER_API,
   STATUS_URL_SPIDER_WORKER,
   STATUS_URL_WEBSITE,
} from 'env'

import { PrismaService } from 'database'

import { createDiscovery, discoveredModules } from './discovery'
import { buildModules, coveredWorkloads } from './modules'
import { StatusBoard } from './statusBoard'

// What the Service status page shows. One board for the process, built from brain's settings the first time it is asked.
// The explicit modules need a check of their own; every other workload in the cluster is added by discovery.
export class StatusService {
   private static board: StatusBoard | undefined

   public static snapshot() {
      if (!this.board) {
         const explicit = buildModules({
            websiteUrl: STATUS_URL_WEBSITE,
            signInUrl: STATUS_URL_SIGN_IN,
            brainWorkerUrl: STATUS_URL_BRAIN_WORKER,
            spiderApiUrl: STATUS_URL_SPIDER_API,
            spiderWorkerUrl: STATUS_URL_SPIDER_WORKER,
            smtp: AUTHENTIK_EMAIL__HOST
               ? {
                    host: AUTHENTIK_EMAIL__HOST,
                    port: AUTHENTIK_EMAIL__PORT,
                    tls: AUTHENTIK_EMAIL__USE_SSL,
                 }
               : null,
            ipInfoToken: IPINFO_TOKEN,
            databaseIsHealthy: () => PrismaService.isHealthy(),
            brokerIsHealthy: () => MessageBroker.isHealthy(),
         })
         const covered = coveredWorkloads(explicit)
         const discover = createDiscovery()

         this.board = new StatusBoard(async () => [...explicit, ...discoveredModules(await discover(), covered)])
      }

      return this.board.snapshot()
   }
}
