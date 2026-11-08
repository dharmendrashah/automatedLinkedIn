import express from 'express'
import http from 'http'

import { PORT } from 'env'

import { log } from './log'

export class HttpServer {
   public static create() {
      const app = express()

      const server = http.createServer(app)

      server.listen(PORT, '0.0.0.0', () => {
         log.info('Server has launched', { port: PORT })
      })

      return { app }
   }
}
