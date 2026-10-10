import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Application } from 'express'
import { join, resolve } from 'path'

import { type RequestHandler } from 'express-serve-static-core'

import { CORS_ORIGINS, isProd } from 'env'

import { initializeTrpc } from 'trpc/api/router'

import { Health } from './health'

export class Middlewares {
   public static config(app: Application) {
      app.use(
         cors({
            origin: CORS_ORIGINS.split(',')
               .map(origin => origin.trim())
               .filter(Boolean),
            allowedHeaders: ['authorization', 'content-type'],
         }) as RequestHandler
      )

      app.use(cookieParser() as RequestHandler)

      Health.config(app)

      initializeTrpc(app)

      if (isProd) {
         this.serveWeb(app)
      }
   }

   private static serveWeb(app: Application) {
      const buildPath = resolve(__dirname, '../../../../web/dist')

      app.use(express.static(buildPath) as unknown as RequestHandler)

      app.get('/{*splat}', (_, res) => res.sendFile(join(buildPath, 'index.html')))
   }
}
