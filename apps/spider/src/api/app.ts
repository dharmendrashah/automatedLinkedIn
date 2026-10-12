import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'

import { type ScrapeTaskCommand } from '../types'

import { TaskError } from '../scraping/errors'
import { type HostPolicy } from '../scraping/policy'
import { scrapeRequestSchema, scrapeTaskCommandSchema } from '../types/schema'

export type AppDeps = {
   policy: HostPolicy
   publish: (command: ScrapeTaskCommand) => Promise<void>
   isBrokerHealthy: () => Promise<boolean>
   info: { commit: string; builtAt: string }
   logger?: boolean
   newTaskId?: () => string
   now?: () => Date
}

const MAX_BODY_BYTES = 100 * 1024

// Only paths and rule messages go back to the client, never the values it sent: they may be secrets.
const problems = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
   error.issues.map(({ path, message }) => ({
      path: path.join('.'),
      message,
   }))

export const buildApp = ({
   policy,
   publish,
   isBrokerHealthy,
   info,
   logger = false,
   newTaskId = randomUUID,
   now = () => new Date(),
}: AppDeps) => {
   const app = Fastify({
      logger,
      bodyLimit: MAX_BODY_BYTES,
   })

   app.post('/tasks', async (request, reply) => {
      const body = scrapeRequestSchema.safeParse(request.body)

      if (!body.success) {
         return reply.code(400).send({
            error: 'The task is not valid',
            issues: problems(body.error),
         })
      }

      const command = scrapeTaskCommandSchema.safeParse({
         ...body.data,
         task_id: newTaskId(),
         timestamp: now().toISOString(),
      })

      if (!command.success) {
         return reply.code(400).send({
            error: 'The task is not valid',
            issues: problems(command.error),
         })
      }

      try {
         policy.assertAllowedUrl(command.data.target_url)

         for (const { params } of command.data.actions) {
            if (params.url) {
               policy.assertAllowedUrl(params.url)
            }
         }
      } catch (error) {
         if (error instanceof TaskError) {
            return reply.code(422).send({ error: error.message })
         }

         throw error
      }

      try {
         await publish(command.data)
      } catch (error) {
         request.log.error(
            {
               taskId: command.data.task_id,
               reason: (error as Error).message,
            },
            'could not queue a task'
         )

         return reply.code(503).send({ error: 'The task queue is not available' })
      }

      return reply.code(202).send({ task_id: command.data.task_id })
   })

   app.get('/health', async (_, reply) => {
      const broker = await isBrokerHealthy().catch(() => false)

      return reply
         .header('Cache-Control', 'no-store')
         .code(broker ? 200 : 503)
         .send({
            status: broker ? 'ok' : 'error',
            service: 'spider-api',
            commit: info.commit,
            builtAt: info.builtAt,
            broker: broker ? 'up' : 'down',
         })
   })

   return app
}
