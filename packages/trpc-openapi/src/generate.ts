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
   /** A procedure's own summary, by its dot path (e.g. "workflow.rotateToken"). Missing: a readable guess from the
    *  path itself, so nothing is left with no summary at all. */
   operationSummaries?: Record<string, string>
   /** A tag's (a resolver module's) own description, by its name (e.g. "workflow"). */
   moduleDescriptions?: Record<string, string>
}

type JsonSchema = Record<string, unknown>

const isZodObject = (schema: unknown): schema is z.ZodObject => schema instanceof z.ZodObject

// "expiresInDays" -> "Expires in days". Used only where a field has no real description (no Zod `.describe()`
// today, and none written for this field by hand), so every input value still shows something readable rather than
// a bare type.
const humanize = (text: string) =>
   text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^./, first => first.toUpperCase())

// Walks a generated JSON Schema and fills in a `description` for every object property and array item that does not
// already have one (a real Zod `.describe()` always wins; this only fills the gap).
const withFieldDescriptions = (schema: JsonSchema): JsonSchema => {
   if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
      const properties = schema.properties as Record<string, JsonSchema>

      return {
         ...schema,
         properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [
               key,
               withFieldDescriptions(
                  value.description
                     ? value
                     : {
                          ...value,
                          description: humanize(key),
                       }
               ),
            ])
         ),
      }
   }

   if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
      return {
         ...schema,
         items: withFieldDescriptions(schema.items as JsonSchema),
      }
   }

   for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const branches = schema[key]

      if (Array.isArray(branches)) {
         return {
            ...schema,
            [key]: branches.map(branch => withFieldDescriptions(branch as JsonSchema)),
         }
      }
   }

   return schema
}

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
   const body = withFieldDescriptions(z.toJSONSchema(schema, { unrepresentable: 'any' }) as JsonSchema)

   return note
      ? {
           ...body,
           description: note,
        }
      : body
}

const tagOf = (path: string) => path.split('.')[0] ?? path

// A path's own last segment, humanized, when no real summary was written for it (e.g. "rotateToken" -> "Rotate
// token"). The tag already carries the module, so only the leaf is used.
const summaryOf = (path: string, summaries: Record<string, string> | undefined) =>
   summaries?.[path] ?? humanize(path.split('.').at(-1) ?? path)

const operationOf = (path: string, procedure: RawProcedure, options: GenerateOptions) => {
   const schema = mergedInput(procedure._def.inputs)
   const note =
      procedure._def.inputs.length > 1 && !procedure._def.inputs.every(isZodObject)
         ? 'Only the last chained .input() is shown.'
         : undefined
   const requestSchema = schema ? jsonSchemaOf(schema, note) : null

   const base = {
      operationId: path,
      summary: summaryOf(path, options.operationSummaries),
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

      paths[`${base}/${path}`] = operationOf(path, procedure, options)
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
         .map(name => ({
            name,
            ...(options.moduleDescriptions?.[name] ? { description: options.moduleDescriptions[name] } : {}),
         })),
      paths,
      components: {
         securitySchemes: {
            apiToken: {
               type: 'http',
               scheme: 'bearer',
               description:
                  'Your API token (create one from Profile \u2192 API keys). It works on every endpoint, as you. ' +
                  "The browser session's own access token also works.",
            },
         },
      },
      security: [{ apiToken: [] }],
   }
}
