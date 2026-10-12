import { z } from 'zod'

// Same shape as an AES-256-GCM bundle in brain's database, so brain can forward it as stored.
export const sealedSchema = z.strictObject({
   ciphertext: z.string().min(1).max(200_000),
   iv: z.string().min(1).max(100),
   tag: z.string().min(1).max(100),
   key_version: z.number().int().min(1),
})

// A proxy a browser session connects through. Carries credentials, so it is never logged or echoed.
export const proxySchema = z.strictObject({
   server: z.url({ protocol: /^(https?|socks4|socks5)$/ }).max(2048),
   username: z.string().max(256).optional(),
   password: z.string().max(256).optional(),
   bypass: z.string().max(1000).optional(),
})

// Names objects in the bucket, so the first character rules out `.` and `..`.
export const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

export const accountIdSchema = z.string().regex(ACCOUNT_ID_PATTERN)

// Where a run's recording lives. Brain signs links for files under it, so the shape is checked strictly.
export const RECORDING_PREFIX_PATTERN = /^recordings\/(validate|task|browser-test)\/[A-Za-z0-9-]{1,64}\/\d{8}T\d{6}Z$/

export const recordingPrefixSchema = z.string().regex(RECORDING_PREFIX_PATTERN)

// What brain asks spider to check. The secrets stay sealed: only the worker holds the key to open them.
export const validateAccountCommandSchema = z.strictObject({
   validation_id: z.uuid(),
   account_id: accountIdSchema,
   email: z.string().min(1).max(320),
   sealed: sealedSchema,
   // The account's own proxy (see proxy-server-manager.md); absent only for accounts with no working proxy yet.
   proxy: proxySchema.optional(),
   requested_at: z.iso.datetime(),
})

export const VALIDATION_OUTCOMES = ['VALID', 'INVALID_CREDENTIALS', 'NEEDS_REAUTH', 'ERROR'] as const

// The one sentence spider uses when LinkedIn asks for a security check the owner has to complete. Brain recognises it to
// know that signing in again through another proxy is worth trying (see .plan/spider-session-recording.md).
export const SECURITY_CHECK_MESSAGE = 'LinkedIn asked for a security check that you have to complete yourself.'

// What spider answers. `message` is one of a few fixed sentences, never page content or a secret.
export const validateAccountResultSchema = z.strictObject({
   validation_id: z.uuid(),
   account_id: accountIdSchema,
   outcome: z.enum(VALIDATION_OUTCOMES),
   message: z.string().max(200),
   // Where spider saved the refreshed session. Never the cookie values.
   session_storage_path: z.string().max(300).optional(),
   // Where spider saved the recording of this run (see .plan/spider-session-recording.md); absent when none was kept.
   recording_prefix: recordingPrefixSchema.optional(),
   checked_at: z.iso.datetime(),
})

// Standard tasks are jobs that need no LinkedIn account: the command carries only what the task itself needs. A union on
// `task`, so a new task is one more member (see .plan/spider-browser-test.md).
export const standardTaskCommandSchema = z.discriminatedUnion('task', [
   z.strictObject({
      task: z.literal('browser_detection'),
      task_id: z.uuid(),
      // The proxy to test the browser through; the test never falls back to a direct connection.
      proxy: proxySchema.optional(),
      requested_at: z.iso.datetime(),
   }),
])

// Not detected: every detection page took the browser for a person. Could not tell: a page did not load or its answer was
// not understood, and no page said bot.
export const BROWSER_TEST_OUTCOMES = ['NOT_DETECTED', 'DETECTED', 'COULD_NOT_TELL'] as const

// What spider answers. The details of a run live in a file under the recording prefix, not on the wire.
export const standardTaskResultSchema = z.strictObject({
   task: z.literal('browser_detection'),
   task_id: z.uuid(),
   outcome: z.enum(BROWSER_TEST_OUTCOMES),
   message: z.string().max(200),
   recording_prefix: recordingPrefixSchema.optional(),
   finished_at: z.iso.datetime(),
})

export type Sealed = z.infer<typeof sealedSchema>
export type ProxyConfig = z.infer<typeof proxySchema>
export type ValidateAccountCommand = z.infer<typeof validateAccountCommandSchema>
export type ValidateAccountResult = z.infer<typeof validateAccountResultSchema>
export type ValidationOutcome = (typeof VALIDATION_OUTCOMES)[number]
export type StandardTaskCommand = z.infer<typeof standardTaskCommandSchema>
export type StandardTaskResult = z.infer<typeof standardTaskResultSchema>
export type BrowserTestOutcome = (typeof BROWSER_TEST_OUTCOMES)[number]
