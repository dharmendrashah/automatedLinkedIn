import 'dotenv/config'

import './aliases'

import { AccountValidationQueue, HttpServer, MessageBroker, StandardTaskQueue } from 'core'

import { LinkedInAccountValidationService, PrismaService, SpiderSessionService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

// The worker's answers to "is this LinkedIn login valid". It keeps trying if RabbitMQ is not up yet.
const validationResults = AccountValidationQueue.consume(async result => {
   await LinkedInAccountValidationService.applyResult(result)
})

// The worker's answers to standard tasks, such as a proxy's browser test: they finish the session that shows them.
const standardResults = StandardTaskQueue.consume(async result => {
   await SpiderSessionService.finishStandard(result)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      Promise.all([validationResults, standardResults])
         .then(consumers => Promise.all(consumers.map(consumer => consumer.stop())))
         .then(() => Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()]))
         .then(() => {
            console.log(`database and broker connections closed`)
         })
         .finally(() => {
            process.exit(0)
         })
   )
}
