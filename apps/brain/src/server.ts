import 'dotenv/config'

import './aliases'

import { HttpServer, MessageBroker, TakeoverRelay } from 'core'

import { ADMIN_EMAIL } from 'env'

import { PrismaService, UserService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

// The platform owner's role follows ADMIN_EMAIL at every start, for a user who signed in before it was set.
UserService.syncAdmin(ADMIN_EMAIL).catch((error: unknown) => {
   console.error(`Could not apply ADMIN_EMAIL: ${error instanceof Error ? error.message : 'unknown error'}`)
})

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
