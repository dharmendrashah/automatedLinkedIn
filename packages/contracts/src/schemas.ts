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

// The one sentence spider uses when LinkedIn asks for a security check the owner has to complete. Brain recognises it to
// know that signing in again through another proxy is worth trying (see .plan/spider-session-recording.md).
export const SECURITY_CHECK_MESSAGE = 'LinkedIn asked for a security check that you have to complete yourself.'

export type Sealed = z.infer<typeof sealedSchema>
export type ProxyConfig = z.infer<typeof proxySchema>
