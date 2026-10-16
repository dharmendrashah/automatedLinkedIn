import 'dotenv/config'

import './aliases'

import { HttpServer, MessageBroker, TakeoverRelay } from 'core'

import { PrismaService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

// The pictures of a page a worker holds for its owner (human takeover). They stay here because the tRPC calls read them
// from this process's memory. Task results, the catalog and scheduled jobs run in the brain worker (src/worker).
const takeoverFrames = TakeoverRelay.consume()

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      takeoverFrames
         .then(consumer => consumer.stop())
         .then(() => Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()]))
         .then(() => {
            console.log(`database and broker connections closed`)
         })
         .finally(() => {
            process.exit(0)
         })
   )
}
