import 'dotenv/config'

import './aliases'

import { HttpServer, MessageBroker } from 'core'

import { PrismaService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()])
         .then(() => {
            console.log(`database and broker connections closed`)
         })
         .finally(() => {
            process.exit(0)
         })
   )
}
