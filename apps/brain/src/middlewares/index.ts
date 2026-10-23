import cookieParser from 'cookie-parser'
import cors from 'cors'
import { type Application } from 'express'

import { type RequestHandler } from 'express-serve-static-core'

import { CORS_ORIGINS } from 'env'

import { initializeTrpc } from 'trpc/api/router'

import { Health } from './health'
import { Uploads } from './uploads'
import { WorkflowApi } from './workflowApi'

export class Middlewares {
   public static config(app: Application) {
      app.use(
         cors({
            origin: CORS_ORIGINS.split(',')
               .map(origin => origin.trim())
               .filter(Boolean),
            allowedHeaders: ['authorization', 'content-type', 'x-file-name'],
         }) as RequestHandler
      )

      app.use(cookieParser() as RequestHandler)

      Health.config(app)

      WorkflowApi.config(app)

      Uploads.config(app)

      initializeTrpc(app)
   }
}
