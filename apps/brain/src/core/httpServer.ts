import express from 'express'
import http from 'http'

import { PORT } from 'env'

export class HttpServer {
   public static create() {
      const app = express()

      const server = http.createServer(app)

      server.listen(PORT, '0.0.0.0', () => {

         console.log(`🚀 Server has launched`)
         console.log('Please visit to http://localhost:'+PORT)
      })

      return { app }
   }
}
