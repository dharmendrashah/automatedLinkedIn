import 'dotenv/config'

import './aliases'

import { AccountValidationQueue, HttpServer, MessageBroker, TaskQueue } from 'core'

import { LinkedInAccountValidationService, PrismaService, TaskService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

// The worker's answers to "is this LinkedIn login valid". It keeps trying if RabbitMQ is not up yet.
const validationResults = AccountValidationQueue.consume(async result => {
   await LinkedInAccountValidationService.applyResult(result)
})

// The worker's answers to every task, and the list of tasks it can run.
const taskResults = TaskQueue.consumeResults(async result => {
   await TaskService.applyResult(result)
})
const taskCatalog = TaskQueue.consumeCatalog(async catalog => {
   await TaskService.applyCatalog(catalog)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      Promise.all([validationResults, taskResults, taskCatalog])
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
