import { createDecipheriv } from 'node:crypto'
import { z } from 'zod'

import { type Sealed } from '@automatedLinkedIn/contracts'

const bundleSchema = z.strictObject({
   password: z.string().optional(),
   totpSecret: z.string().optional(),
   session: z.string().optional(),
})

// Same bundle shape as a saved proxy's secret column (apps/brain/src/database/proxyServer.service.ts).
const proxyBundleSchema = z.strictObject({
   username: z.string().optional(),
   password: z.string().optional(),
})

export type Credentials = z.infer<typeof bundleSchema>

export type ProxyCredentials = z.infer<typeof proxyBundleSchema>

const SUPPORTED_KEY_VERSION = 1

// The AES-256-GCM decrypt brain's sealing produces, shared by every bundle shape sealed with it. Throws without ever
// including the plaintext in the message: a wrong key and a changed ciphertext both end up here.
export const decryptSealed = (sealed: Sealed, keyBase64: string): string => {
   const key = Buffer.from(keyBase64, 'base64')

   if (key.length !== 32) {
      throw new Error('LINKEDIN_CRED_ENC_KEY must be a base64-encoded 32-byte key')
   }

   if (sealed.key_version !== SUPPORTED_KEY_VERSION) {
      throw new Error(`The credentials use key version ${sealed.key_version}, which this worker cannot read`)
   }

   const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'))

   decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))

   const plaintext = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()])

   return plaintext.toString('utf8')
}

// Opens the bundle brain sealed for a LinkedIn account's credentials.
export const openCredentials = (sealed: Sealed, keyBase64: string): Credentials => {
   const parsed = bundleSchema.safeParse(JSON.parse(decryptSealed(sealed, keyBase64)))

   if (!parsed.success) {
      throw new Error('The credentials are not in the expected shape')
   }

   return parsed.data
}

// Opens the bundle brain sealed for a saved proxy's username/password. Local devtools use only (apps/spider/src/devtools).
export const openProxyCredentials = (sealed: Sealed, keyBase64: string): ProxyCredentials => {
   const parsed = proxyBundleSchema.safeParse(JSON.parse(decryptSealed(sealed, keyBase64)))

   if (!parsed.success) {
      throw new Error('The proxy credentials are not in the expected shape')
   }

   return parsed.data
}
