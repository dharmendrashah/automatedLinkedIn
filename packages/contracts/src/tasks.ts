import { z } from 'zod'

import { accountIdSchema, proxySchema, sealedSchema } from './schemas'

// The one contract every task uses (see .plan/spider-task-framework.md). Task-specific content travels only inside `input`
// and `report`, which are plain JSON that brain never interprets.
export const TASK_CONTRACT_VERSION = 1

export const TASK_NAME_PATTERN = /^[a-z][a-z0-9-]{0,49}$/

// Names a folder in the bucket, so no slash, dot or empty value.
export const USER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const VERDICT_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/

export const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

const MAX_INPUT_BYTES = 8 * 1024
const MAX_CATALOG_SCHEMA_BYTES = 32 * 1024
const MAX_ARTIFACTS = 300

export const taskNameSchema = z.string().regex(TASK_NAME_PATTERN)

const verdictSchema = z.string().regex(VERDICT_PATTERN)

const withinBytes = (limit: number) => (value: unknown) => JSON.stringify(value).length <= limit

export const TASK_TRIGGERS = ['manual', 'automatic', 'retry'] as const

export const taskCommandSchema = z.strictObject({
   contract: z.literal(TASK_CONTRACT_VERSION),
   // Also the id of the session that shows the run.
   task_id: z.uuid(),
   // Brain's own user id: only used to build the bucket folder, never to decide who may see what.
   user_id: z.string().regex(USER_ID_PATTERN),
   task: taskNameSchema,
   task_version: z.number().int().min(1),
   requested_at: z.iso.datetime(),
   trigger: z.enum(TASK_TRIGGERS),
   // The user's own proxy, resolved by brain; a task that needs one never falls back to a direct connection.
   proxy: proxySchema.optional(),
   account_id: accountIdSchema.optional(),
   // Sealed exactly as stored: only the worker holds the key. Present only for a task that needs an account.
   credentials: sealedSchema.optional(),
   // Validated by the task's own schema in the spider; brain only checks that it is a small JSON object.
   input: z.record(z.string(), z.unknown()).refine(withinBytes(MAX_INPUT_BYTES), { message: 'input is too large' }),
})

export const ARTIFACT_KINDS = ['log', 'network', 'video', 'screenshot', 'report', 'session', 'file'] as const

export const artifactSchema = z.strictObject({
   kind: z.enum(ARTIFACT_KINDS),
   name: z.string().regex(ARTIFACT_NAME_PATTERN),
   // Checked by brain against the folder it computes for the run, so it is never trusted on its own.
   path: z.string().max(300),
   content_type: z.string().max(100),
   bytes: z.number().int().min(0),
   // The recorded step a screenshot belongs to.
   step: z.number().int().min(0).optional(),
   // Holds login tokens (kind "session"): shown to the owner only on request.
   sensitive: z.boolean().optional(),
})

const reportItemSchema = z.strictObject({
   label: z.string().max(100),
   value: z.string().max(500),
   status: z.enum(['ok', 'warn', 'fail']).optional(),
})

// Text a task wants the owner to read, in a shape the web app renders for any task. Always shown as plain text.
export const reportSchema = z.strictObject({
   headline: z.string().max(200),
   sections: z
      .array(
         z.strictObject({
            title: z.string().max(100),
            items: z.array(reportItemSchema).max(100),
         })
      )
      .max(20),
})

export const taskResultSchema = z.strictObject({
   contract: z.literal(TASK_CONTRACT_VERSION),
   task_id: z.uuid(),
   task: taskNameSchema,
   task_version: z.number().int().min(1),
   status: z.enum(['SUCCEEDED', 'FAILED']),
   // The task's own code, for example NOT_DETECTED. Brain stores it and never interprets it.
   verdict: verdictSchema,
   // One fixed sentence, never page content or a secret.
   message: z.string().max(200),
   report: reportSchema.optional(),
   artifacts: z.array(artifactSchema).max(MAX_ARTIFACTS),
   artifacts_truncated: z.boolean(),
   // The build of the worker that ran it, so a run can be reproduced.
   worker: z.strictObject({ build: z.string().min(1).max(64) }),
   started_at: z.iso.datetime(),
   finished_at: z.iso.datetime(),
})

export const verdictToneSchema = z.enum(['success', 'failure', 'neutral'])

// What the worker announces about each task it can run, so brain and the web app never import spider code.
export const taskCatalogEntrySchema = z.strictObject({
   contract: z.literal(TASK_CONTRACT_VERSION),
   task: taskNameSchema,
   version: z.number().int().min(1),
   title: z.string().max(100),
   description: z.string().max(500),
   // JSON Schema of `input`, derived from the task's own schema.
   input_schema: z.record(z.string(), z.unknown()).refine(withinBytes(MAX_CATALOG_SCHEMA_BYTES)),
   needs: z.strictObject({
      proxy: z.enum(['required', 'optional', 'none']),
      account: z.boolean(),
   }),
   verdicts: z.record(
      verdictSchema,
      z.strictObject({
         label: z.string().max(60),
         tone: verdictToneSchema,
      })
   ),
   policy: z.strictObject({
      cooldown_ms: z.number().int().min(0),
      one_at_a_time: z.enum(['proxy', 'account', 'none']),
      // Events brain emits (for example proxy.active) that start this task by themselves.
      automatic: z
         .array(
            z.strictObject({
               on: z.string().regex(/^[a-z]+(\.[a-z]+)+$/),
               every_ms: z.number().int().min(1),
            })
         )
         .max(10)
         .optional(),
   }),
   // Verdicts that another proxy may fix, so the web app offers "try again" for them.
   retry_on: z.array(verdictSchema).max(20).optional(),
   // The sites the task means to visit; the operator's allowlist still decides.
   hosts: z.array(z.string().max(255)).max(20),
})

type RunRequest = { task: string; user_id: string; requested_at: string; task_id: string }

// Where the files of one run live. A pure function of the request, so the spider writes under it and brain computes the
// same folder instead of trusting a path from a result. The date is the request's, in UTC, so a redelivery keeps the folder.
export const runPrefix = ({ task, user_id: userId, requested_at: requestedAt, task_id: taskId }: RunRequest) => {
   const time = new Date(requestedAt)

   if (
      !TASK_NAME_PATTERN.test(task) ||
      !USER_ID_PATTERN.test(userId) ||
      !UUID_PATTERN.test(taskId) ||
      Number.isNaN(time.getTime())
   ) {
      throw new Error('Not a valid run request')
   }

   const month = String(time.getUTCMonth() + 1).padStart(2, '0')
   const day = String(time.getUTCDate()).padStart(2, '0')

   return `runs/${task}/${userId}/${time.getUTCFullYear()}/${month}/${day}/${taskId}`
}

export const RUN_PREFIX_PATTERN =
   /^runs\/[a-z][a-z0-9-]{0,49}\/[A-Za-z0-9-]{1,64}\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const ARTIFACT_FILE = /^(?:(?:screenshots|files)\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

// True only for a file directly in the run's folder, or in its screenshots or files folder.
export const artifactPathUnder = (prefix: string, path: string) =>
   path.startsWith(`${prefix}/`) && ARTIFACT_FILE.test(path.slice(prefix.length + 1))

export type TaskCommand = z.infer<typeof taskCommandSchema>
export type TaskResult = z.infer<typeof taskResultSchema>
export type TaskCatalogEntry = z.infer<typeof taskCatalogEntrySchema>
export type Artifact = z.infer<typeof artifactSchema>
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]
export type TaskReport = z.infer<typeof reportSchema>
export type TaskTrigger = (typeof TASK_TRIGGERS)[number]
