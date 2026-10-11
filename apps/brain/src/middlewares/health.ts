import { type Application } from 'express'

import { MessageBroker } from 'core'

import { BUILD_TIME, GIT_SHA } from 'env'

import { PrismaService } from 'database'

// Set once when the process starts. A new value means this pod was (re)started.
const STARTED_AT = new Date().toISOString()

export class Health {
   public static config(app: Application) {
      app.get('/health', async (_, response) => {
         const [database, broker] = await Promise.all([
            PrismaService.isHealthy().catch(() => false),
            MessageBroker.isHealthy().catch(() => false),
         ])

         // Only the database gates readiness: the API works without the queue, and a broker restart must not pull brain out of service.
         return response
            .set('Cache-Control', 'no-store')
            .status(database ? 200 : 503)
            .json({
               status: database ? 'ok' : 'error',
               service: 'brain',
               commit: GIT_SHA,
               builtAt: BUILD_TIME,
               startedAt: STARTED_AT,
               database: database ? 'up' : 'down',
               broker: broker ? 'up' : 'down',
            })
      })
   }
}
