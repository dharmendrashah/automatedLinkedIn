import cookieParser from 'cookie-parser'
import cors from 'cors'
import { type Application } from 'express'

import { type RequestHandler } from 'express-serve-static-core'

import { CORS_ORIGINS } from 'env'

import { initializeTrpc } from 'trpc/api/router'

import { Cdn } from './cdn'
import { Health } from './health'
import { WorkflowApi } from './workflowApi'

export class Middlewares {
   public static config(app: Application) {
      // One hop: the ingress sets X-Forwarded-For, so request.ip is the caller (the /cdn rate limit counts by it).
      app.set('trust proxy', 1)

      const origins = CORS_ORIGINS.split(',')
         .map(origin => origin.trim())
         .filter(Boolean)

      // Every path; "*" in CORS_ORIGINS lets any origin call, else only the listed ones.
      app.use(
         cors({
            origin: origins.includes('*') ? true : origins,
            allowedHeaders: ['authorization', 'content-type'],
         }) as RequestHandler
      )

      app.use(cookieParser() as RequestHandler)

      Health.config(app)

      WorkflowApi.config(app)

      Cdn.config(app)

      initializeTrpc(app)
   }
}
