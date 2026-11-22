import { initTRPC } from '@trpc/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateOpenApiDocument } from './generate'

const t = initTRPC.create()

const appRouter = t.router({
   workflow: t.router({
      rotateToken: t.procedure.input(z.object({ id: z.string().describe('the workflow id') })).mutation(() => 'ok'),
      list: t.procedure.query(() => []),
   }),
   me: t.router({ get: t.procedure.query(() => ({ id: '1' })) }),
   chained: t.router({
      // Several `.input()` calls on one procedure; both are plain objects, so they merge.
      both: t.procedure
         .input(z.object({ a: z.string() }))
         .input(z.object({ b: z.number() }))
         .query(() => 'x'),
   }),
})

describe('generateOpenApiDocument', () => {
   it('builds a GET path for a query with its input as a query parameter', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/workflow.list']

      expect(op).toHaveProperty('get')
      expect((op as { get: { parameters: unknown[] } }).get.parameters).toEqual([])
   })

   it('builds a POST path for a mutation with a request body built from its input', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/workflow.rotateToken'] as {
         post: { requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } } }
      }

      expect(op.post.requestBody.content['application/json'].schema).toMatchObject({
         type: 'object',
         properties: {
            id: {
               type: 'string',
               description: 'the workflow id',
            },
         },
         required: ['id'],
      })
   })

   it('groups procedures into tags by the first path segment', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      expect(doc.tags.map(tag => tag.name)).toEqual(['chained', 'me', 'workflow'])
      expect(doc.paths['/workflow.list']).toBeDefined()
      expect((doc.paths['/me.get'] as { get: unknown }).get).toBeDefined()
   })

   it('merges several .input() calls on one procedure into one object schema', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/chained.both'] as { get: { parameters: { schema: Record<string, unknown> }[] } }

      expect(op.get.parameters[0]?.schema).toMatchObject({
         type: 'object',
         properties: {
            a: { type: 'string' },
            b: { type: 'number' },
         },
      })
   })

   it('applies the given base path and merges in extra hand-written paths', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
         basePath: '/trpc',
         extraPaths: { '/api/workflows/{id}/run': { post: { operationId: 'workflows.run' } } },
      })

      expect(doc.paths['/trpc/workflow.list']).toBeDefined()
      expect(doc.paths['/api/workflows/{id}/run']).toEqual({ post: { operationId: 'workflows.run' } })
   })

   it('declares one shared bearer security scheme for both token kinds', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
         type: 'http',
         scheme: 'bearer',
      })
      expect(doc.security).toEqual([{ bearerAuth: [] }])
   })

   it('does not throw on a router with no procedures', () => {
      const empty = t.router({})

      expect(() =>
         generateOpenApiDocument(empty as never, {
            title: 'Empty',
            version: '1.0.0',
         })
      ).not.toThrow()
   })
})
