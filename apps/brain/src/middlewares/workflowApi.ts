import { type Application } from 'express'
import { Readable } from 'stream'
import { z } from 'zod'

import { API_LIMITS, ConflictError, WorkflowTriggerService, readGraph } from 'database'

// The address another system calls to start a workflow (.plan/gtm-phase-3-blocks-triggers.md):
// POST /api/workflows/:id/run with "Authorization: Bearer <token>". An optional "Idempotency-Key" still makes a
// repeated call answer with the run it started.

const links = z.array(z.string().trim().min(1).max(500)).max(API_LIMITS.items)

const bodySchema = z
   .object({
      posts: links.optional(),
      profiles: links.optional(),
      companies: links.optional(),
   })
   .strict()
   .refine(
      body =>
         (body.posts?.length ?? 0) + (body.profiles?.length ?? 0) + (body.companies?.length ?? 0) <= API_LIMITS.items,
      { message: `Send at most ${API_LIMITS.items} links in posts, profiles or companies.` }
   )

const KEY = /^[\w-]{1,100}$/
const MAX_BODY = 64 * 1024

// Read by hand: the body parser's types do not match Express 5's handler types here. An empty body is {}: a workflow
// that finds its own input needs nothing. Undefined when too big or not JSON.
const readBody = async (stream: AsyncIterable<unknown>) => {
   const chunks: Buffer[] = []
   let size = 0

   for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) || (size += chunk.length) > MAX_BODY) {
         return undefined
      }

      chunks.push(chunk)
   }

   if (size === 0) {
      return {}
   }

   try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))

      return parsed
   } catch {
      return undefined
   }
}

export class WorkflowApi {
   public static config(app: Application) {
      app.post('/api/workflows/:id/run', async (request, response) => {
         const token = /^Bearer (\S+)$/.exec(request.get('authorization') ?? '')?.[1]
         const workflow = token ? await WorkflowTriggerService.authorize(request.params.id, token) : null

         if (!workflow) {
            return response.status(401).json({ error: 'A valid token for this workflow is required.' })
         }

         if (!workflow.enabled || !readGraph(workflow.graph).nodes.some(({ type }) => type === 'trigger.api')) {
            return response.status(409).json({ error: 'This workflow is switched off or not started by API.' })
         }

         const body = bodySchema.safeParse(request instanceof Readable ? await readBody(request) : undefined)
         const key = request.get('idempotency-key') ?? null

         if (!body.success || (key !== null && !KEY.test(key))) {
            const error = body.error?.issues[0]?.message ?? 'Idempotency-Key must be up to 100 letters, digits, - or _.'

            return response.status(400).json({ error })
         }

         if ((await WorkflowTriggerService.callsLastHour(workflow.id)) >= API_LIMITS.callsPerHour) {
            return response.status(429).json({ error: `At most ${API_LIMITS.callsPerHour} calls an hour.` })
         }

         try {
            const run = await WorkflowTriggerService.startFromApi(workflow, body.data, key)

            return response.status(202).json({
               runId: run?.id,
               status: run?.status,
            })
         } catch (error) {
            if (error instanceof ConflictError) {
               return response.status(409).json({ error: error.message })
            }

            throw error
         }
      })
   }
}
