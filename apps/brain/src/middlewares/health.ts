import { type Application } from 'express'

import { BUILD_TIME, GIT_SHA } from 'env'

import { PrismaService } from 'database'

// Set once when the process starts. A new value means this pod was (re)started.
const STARTED_AT = new Date().toISOString()

export class Health {
   public static config(app: Application) {
      app.get('/healthz', (_, response) => response.status(200).json({ status: 'ok' }))

      app.get('/readyz', async (_, response) => {
         const database = await PrismaService.isHealthy().catch(() => false)

         return database
            ? response.status(200).json({
                 status: 'ok',
                 database: 'up',
              })
            : response.status(503).json({
                 status: 'error',
                 database: 'down',
              })
      })

      app.get('/health', (_, response) =>
         response.set('Cache-Control', 'no-store').status(200).json({
            status: 'ok',
            service: 'brain',
            commit: GIT_SHA,
            builtAt: BUILD_TIME,
            startedAt: STARTED_AT,
         })
      )
   }
}
