import { type Server, createServer } from 'node:http'

import { type ConsumerState } from '../consumers/consumerRunner'
import { type JobState } from '../jobs/jobRunner'

export type HealthSources = {
   consumers: () => ConsumerState[]
   jobs: () => JobState[]
   isDatabaseHealthy: () => Promise<boolean>
   isBrokerHealthy: () => Promise<boolean>
   // How many messages wait in each dead queue.
   deadLetters: () => Promise<Array<{ queue: string; messages: number }>>
   // How many accepted tasks wait to be published, and for how long the oldest has waited.
   taskDispatch: () => Promise<{ waiting: number; oldestSeconds: number }>
   build: { commit: string; builtAt: string }
}

export type HealthResult = {
   ok: boolean
   body: Record<string, unknown>
}

// A probe every few seconds from Kubernetes and from the Service status page must not turn into broker and database
// round trips each time.
const CACHE_MS = 5000

// What the worker says about itself. Only names, states and counts: never an address, an error text or message content.
// Healthy means the database answers and every consumer it runs is connected; a stuck job or a growing dead queue is
// reported but does not take the worker out of service.
export const createHealthReader = (sources: HealthSources) => {
   const startedAt = new Date().toISOString()
   let cached: { at: number; result: HealthResult } | undefined

   const read = async (): Promise<HealthResult> => {
      const [database, broker, dead, dispatch] = await Promise.all([
         sources.isDatabaseHealthy().catch(() => false),
         sources.isBrokerHealthy().catch(() => false),
         sources.deadLetters().catch(() => []),
         sources.taskDispatch().catch(() => ({
            waiting: 0,
            oldestSeconds: 0,
         })),
      ])
      const consumers = sources.consumers()
      const ok = database && consumers.every(({ connected }) => connected)

      return {
         ok,
         body: {
            status: ok ? 'ok' : 'error',
            service: 'brain-worker',
            commit: sources.build.commit,
            builtAt: sources.build.builtAt,
            startedAt,
            database: database ? 'up' : 'down',
            broker: broker ? 'up' : 'down',
            consumers,
            jobs: sources.jobs(),
            deadLetters: dead,
            taskDispatch: dispatch,
         },
      }
   }

   return async (now = Date.now()) => {
      if (!cached || now - cached.at >= CACHE_MS) {
         cached = {
            at: now,
            result: await read(),
         }
      }

      return cached.result
   }
}

export const listenHealth = (read: () => Promise<HealthResult>, port: number) =>
   new Promise<Server>((resolve, reject) => {
      const server = createServer((request, response) => {
         if (request.method !== 'GET' || request.url !== '/health') {
            response.writeHead(404).end()

            return
         }

         read()
            .then(({ ok, body }) => {
               response
                  .writeHead(ok ? 200 : 503, {
                     'Content-Type': 'application/json',
                     'Cache-Control': 'no-store',
                  })
                  .end(JSON.stringify(body))
            })
            .catch(() => {
               response.writeHead(500).end()
            })
      })

      server.once('error', reject)
      server.listen(port, () => resolve(server))
   })
