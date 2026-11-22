import { z } from 'zod'

// Walks a tRPC v11 router's flattened procedure map and builds an OpenAPI 3.1 document from it: one path per
// procedure (GET for a query, POST for a mutation, matching how tRPC's own HTTP adapter answers them), grouped into
// tags by the first segment of its dot path (`workflow.rotateToken` -> tag `workflow`), with a JSON Schema request
// body or query parameter built from the procedure's Zod `.input()`. No output types are required: like the
// official `@trpc/openapi` package, this only documents what a caller must send, not what comes back.

// tRPC flattens a nested router into `router._def.procedures` as `{ "dot.path": procedure }` at runtime (observed
// against the installed @trpc/server here); that shape is not part of its narrow public type surface, so it is read
// through this minimal structural type instead of the library's own (nested, nominal) `RouterRecord` type.
type ProcedureKind = 'query' | 'mutation' | 'subscription'

type RawProcedure = {
   _def: {
      type: ProcedureKind
      inputs: unknown[]
   }
}

export type RawRouter = {
   _def: {
      procedures: Record<string, RawProcedure>
   }
}

export type GenerateOptions = {
   title: string
   version: string
   /** Where the router is mounted, e.g. "/trpc"; every generated path is relative to it. */
   basePath?: string
   servers?: { url: string; description?: string }[]
   /** Extra paths to merge in as-is, for routes outside the router (a raw REST endpoint, say). */
   extraPaths?: Record<string, Record<string, unknown>>
}

type JsonSchema = Record<string, unknown>

const isZodObject = (schema: unknown): schema is z.ZodObject => schema instanceof z.ZodObject

// Multiple chained `.input()` calls are read by tRPC as separate schemas, not a merged one. When every one is a
// plain object, their shapes are combined; otherwise only the last is used (noted in its description) rather than
// guessing at a merge.
const mergedInput = (inputs: unknown[]): z.ZodType | null => {
   if (inputs.length === 0) {
      return null
   }

   if (inputs.every(isZodObject)) {
      const objects = inputs as z.ZodObject[]

      return objects.slice(1).reduce((merged, schema) => merged.extend(schema.shape), objects[0])
   }

   const last = inputs[inputs.length - 1]

   return last instanceof z.ZodType ? last : null
}

const jsonSchemaOf = (schema: z.ZodType, note?: string): JsonSchema => {
   const body = z.toJSONSchema(schema, { unrepresentable: 'any' }) as JsonSchema

   return note
      ? {
           ...body,
           description: note,
        }
      : body
}

const tagOf = (path: string) => path.split('.')[0] ?? path

const operationOf = (path: string, procedure: RawProcedure) => {
   const schema = mergedInput(procedure._def.inputs)
   const note =
      procedure._def.inputs.length > 1 && !procedure._def.inputs.every(isZodObject)
         ? 'Only the last chained .input() is shown.'
         : undefined
   const requestSchema = schema ? jsonSchemaOf(schema, note) : null

   const base = {
      operationId: path,
      tags: [tagOf(path)],
      responses: {
         '200': { description: "The procedure's result, in tRPC's envelope (`result.data`)." },
         '401': { description: 'Missing or invalid Authorization header (authentik access token or API key).' },
      },
   }

   if (procedure._def.type === 'query') {
      return {
         get: {
            ...base,
            parameters: requestSchema
               ? [
                    {
                       name: 'input',
                       in: 'query',
                       description: 'JSON-encoded input.',
                       required: true,
                       schema: requestSchema,
                    },
                 ]
               : [],
         },
      }
   }

   return {
      post: {
         ...base,
         requestBody: requestSchema
            ? {
                 required: true,
                 content: { 'application/json': { schema: requestSchema } },
              }
            : undefined,
      },
   }
}

export const generateOpenApiDocument = (router: RawRouter, options: GenerateOptions) => {
   const { procedures } = router._def
   const paths: Record<string, Record<string, unknown>> = { ...options.extraPaths }

   for (const [path, procedure] of Object.entries(procedures)) {
      if (procedure._def.type === 'subscription') {
         continue
      }

      const base = options.basePath ?? ''

      paths[`${base}/${path}`] = operationOf(path, procedure)
   }

   return {
      openapi: '3.1.0',
      info: {
         title: options.title,
         version: options.version,
      },
      servers: options.servers,
      tags: [...new Set(Object.keys(procedures).map(tagOf))]
         .sort((left, right) => left.localeCompare(right))
         .map(name => ({ name })),
      paths,
      components: {
         securitySchemes: {
            bearerAuth: {
               type: 'http',
               scheme: 'bearer',
               description: 'Either an authentik access token or an "alk_"-prefixed API key, both as a Bearer token.',
            },
         },
      },
      security: [{ bearerAuth: [] }],
   }
}
