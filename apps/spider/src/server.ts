import 'dotenv/config'

import { buildApp } from './api/app'
import { BUILD_TIME, GIT_SHA, PORT, RABBITMQ_URL, SPIDER_ALLOWED_HOSTS } from './env'
import { Broker } from './messaging/broker'
import { publishTask } from './messaging/publisher'
import { assertTopology } from './messaging/topology'
import { HostPolicy } from './scraping/policy'

const broker = new Broker(RABBITMQ_URL)

// Declared once; the broker keeps the durable topology, so a reconnect does not need it again.
let topology: Promise<void> | undefined

const ready = () => {
   topology ??= broker
      .publishChannel()
      .then(assertTopology)
      .catch((error: unknown) => {
         topology = undefined

         throw error
      })

   return topology
}

const app = buildApp({
   policy: HostPolicy.fromList(SPIDER_ALLOWED_HOSTS),
   logger: true,
   info: {
      commit: GIT_SHA,
      builtAt: BUILD_TIME,
   },
   isBrokerHealthy: () => broker.isHealthy(),
   publish: async command => {
      await ready()
      await publishTask(await broker.publishChannel(), command)
   },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () => {
      app.close()
         .then(() => broker.close())
         .finally(() => process.exit(0))
   })
}

app.listen({
   port: PORT,
   host: '0.0.0.0',
}).catch((error: unknown) => {
   console.error(`spider api could not start: ${error instanceof Error ? error.message : 'unknown error'}`)
   process.exit(1)
})
