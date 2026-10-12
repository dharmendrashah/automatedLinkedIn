import { MessageBroker } from 'core'

import {
   AUTHENTIK_EMAIL__HOST,
   AUTHENTIK_EMAIL__PORT,
   AUTHENTIK_EMAIL__USE_SSL,
   IPINFO_TOKEN,
   STATUS_AUTHENTIK_WORKER_DEPLOYMENT,
   STATUS_URL_SIGN_IN,
   STATUS_URL_SPIDER_API,
   STATUS_URL_SPIDER_WORKER,
   STATUS_URL_WEBSITE,
} from 'env'

import { PrismaService } from 'database'

import { buildModules } from './modules'
import { StatusBoard, type StatusSnapshot } from './statusBoard'

export type { StatusSnapshot }

// What the Service status page shows. One board for the process, built from brain's settings the first time it is asked.
export class StatusService {
   private static board: StatusBoard | undefined

   public static snapshot() {
      this.board ??= new StatusBoard(
         buildModules({
            websiteUrl: STATUS_URL_WEBSITE,
            signInUrl: STATUS_URL_SIGN_IN,
            spiderApiUrl: STATUS_URL_SPIDER_API,
            spiderWorkerUrl: STATUS_URL_SPIDER_WORKER,
            authentikWorkerDeployment: STATUS_AUTHENTIK_WORKER_DEPLOYMENT,
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
      )

      return this.board.snapshot()
   }
}
