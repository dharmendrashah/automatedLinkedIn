import { type Application } from 'express'

import { PrismaService } from 'database'

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
   }
}
