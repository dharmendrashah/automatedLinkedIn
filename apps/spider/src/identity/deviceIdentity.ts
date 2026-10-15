import { type Fingerprint } from 'fingerprint-generator'
import { z } from 'zod'

const isFingerprint = (value: unknown): value is Fingerprint =>
   typeof value === 'object' && value !== null && 'screen' in value && 'navigator' in value

// The one browser device an account signs in from, kept between runs so LinkedIn sees the same machine every time.
// It holds nothing secret. Language and timezone are added once, from the first run through a proxy.
export const deviceIdentitySchema = z.strictObject({
   version: z.literal(1),
   os: z.enum(['windows', 'macos', 'linux']),
   fingerprint: z.custom<Fingerprint>(isFingerprint, 'Not a browser fingerprint'),
   locale: z
      .string()
      .regex(/^[a-z]{2,3}-[A-Z]{2}$/)
      .optional(),
   timezone: z.string().min(1).max(64).optional(),
   // Where the proxy exited when language and timezone were last pinned; the language only changes with it.
   country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
   createdAt: z.iso.datetime(),
})

export type DeviceIdentity = z.infer<typeof deviceIdentitySchema>
