import 'dotenv/config'

import './aliases'

import { HttpServer, MessageBroker, TaskQueue } from 'core'

import { PrismaService, TaskService } from 'database'

import { Middlewares } from 'middlewares'

const { app } = HttpServer.create()

Middlewares.config(app)

// The worker's answers to every task, and the list of tasks it can run.
const taskResults = TaskQueue.consumeResults(async result => {
   await TaskService.applyResult(result)
})
const taskCatalog = TaskQueue.consumeCatalog(async catalog => {
   await TaskService.applyCatalog(catalog)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.once(signal, () =>
      Promise.all([taskResults, taskCatalog])
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
