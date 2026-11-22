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

   it('declares the account API token as the default bearer security scheme', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      expect(doc.components.securitySchemes.apiToken).toMatchObject({
         type: 'http',
         scheme: 'bearer',
      })
      expect(doc.security).toEqual([{ apiToken: [] }])
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

   it('uses the given summary for an operation, by its dot path', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
         operationSummaries: { 'workflow.rotateToken': 'A new token for the workflow\u2019s API address.' },
      })

      const op = doc.paths['/workflow.rotateToken'] as { post: { summary: string } }

      expect(op.post.summary).toBe('A new token for the workflow\u2019s API address.')
   })

   it('falls back to a humanized summary from the path when none is given', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/workflow.rotateToken'] as { post: { summary: string } }

      expect(op.post.summary).toBe('Rotate token')
   })

   it('uses the given description for a tag, by its name', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
         moduleDescriptions: { workflow: 'A saved workflow and its runs.' },
      })

      expect(doc.tags).toContainEqual({
         name: 'workflow',
         description: 'A saved workflow and its runs.',
      })
      expect(doc.tags).toContainEqual({ name: 'me' })
   })

   it('fills in a readable description for an input field with no Zod .describe()', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/chained.both'] as { get: { parameters: { schema: Record<string, unknown> }[] } }
      const properties = op.get.parameters[0]?.schema.properties as Record<string, { description: string }>

      expect(properties.a.description).toBe('A')
      expect(properties.b.description).toBe('B')
   })

   it('keeps a field\u2019s real Zod .describe() instead of the humanized fallback', () => {
      const doc = generateOpenApiDocument(appRouter as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/workflow.rotateToken'] as {
         post: { requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } } }
      }
      const schema = op.post.requestBody.content['application/json'].schema as {
         properties: Record<string, unknown>
      }

      expect(schema.properties.id).toMatchObject({ description: 'the workflow id' })
   })

   it('fills in descriptions for fields nested inside an object field', () => {
      const addressSchema = z.object({ address: z.object({ postalCode: z.string() }) })
      const nested = t.router({ settings: t.procedure.input(addressSchema).mutation(() => null) })

      const doc = generateOpenApiDocument(nested as never, {
         title: 'Test API',
         version: '1.0.0',
      })

      const op = doc.paths['/settings'] as {
         post: { requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } } }
      }
      const schema = op.post.requestBody.content['application/json'].schema as {
         properties: { address: { description: string; properties: { postalCode: { description: string } } } }
      }

      expect(schema.properties.address.description).toBe('Address')
      expect(schema.properties.address.properties.postalCode.description).toBe('Postal code')
   })
})
