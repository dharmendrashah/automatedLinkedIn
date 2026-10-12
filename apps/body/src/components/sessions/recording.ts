import { z } from 'zod'

// The recording's files come from a bucket the spider writes, and their text comes from LinkedIn or a proxy. They are
// read defensively: anything that is not in the expected shape is left out, and nothing is ever shown as HTML.

const stepSchema = z.object({
   n: z.number(),
   t: z.number(),
   call: z.string(),
   durationMs: z.number(),
   ok: z.boolean(),
   selector: z.string().optional(),
   target: z.string().optional(),
   urlBefore: z.string().optional(),
   urlAfter: z.string().optional(),
   length: z.number().optional(),
   found: z.boolean().optional(),
   count: z.number().optional(),
   error: z.string().optional(),
   screenshot: z.string().optional(),
})

const timelineSchema = z.object({
   startedAt: z.string(),
   durationMs: z.number(),
   outcome: z.enum(['ok', 'failed']),
   verdict: z.string().optional(),
   video: z.boolean(),
   screenshots: z.array(z.string()),
   notes: z.array(z.string()),
   steps: z.array(z.unknown()),
})

const networkSchema = z.object({
   t: z.number(),
   method: z.string(),
   url: z.string(),
   resourceType: z.string(),
   status: z.number().nullable(),
   durationMs: z.number().optional(),
   failure: z.string().optional(),
   requestHeaders: z.record(z.string(), z.string()),
   responseHeaders: z.record(z.string(), z.string()),
   body: z.string().optional(),
   bodyTruncated: z.boolean().optional(),
   bodyDropped: z.boolean().optional(),
})

const logSchema = z.object({
   t: z.number(),
   source: z.enum(['browser', 'spider', 'engine']),
   level: z.enum(['info', 'warn', 'error']),
   message: z.string(),
})

export type TimelineStep = z.infer<typeof stepSchema>
export type Timeline = Omit<z.infer<typeof timelineSchema>, 'steps'> & { steps: TimelineStep[] }
export type NetworkEntry = z.infer<typeof networkSchema>
export type LogEntry = z.infer<typeof logSchema>


const json = (text: string): unknown => {
   try {
      return JSON.parse(text)
   } catch {
      return undefined
   }
}

const valid = <T>(schema: z.ZodType<T>, items: unknown[]) =>
   items.flatMap(item => {
      const parsed = schema.safeParse(item)

      return parsed.success ? [parsed.data] : []
   })

const list = <T>(text: string, schema: z.ZodType<T>) => {
   const parsed = json(text)

   return Array.isArray(parsed) ? valid(schema, parsed) : []
}

export const parseTimeline = (text: string): Timeline | null => {
   const parsed = timelineSchema.safeParse(json(text))

   if (!parsed.success) {
      return null
   }

   return {
      ...parsed.data,
      steps: valid(stepSchema, parsed.data.steps),
   }
}

export const parseNetwork = (text: string) => list(text, networkSchema)
export const parseLogs = (text: string) => list(text, logSchema)
