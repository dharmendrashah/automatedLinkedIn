import { createDecipheriv } from 'node:crypto'
import { z } from 'zod'

import { type Sealed } from '@automatedLinkedIn/contracts'

const bundleSchema = z.strictObject({
   password: z.string().optional(),
   totpSecret: z.string().optional(),
   session: z.string().optional(),
})

export type Credentials = z.infer<typeof bundleSchema>

const SUPPORTED_KEY_VERSION = 1

// Opens the bundle brain sealed (AES-256-GCM). It throws without ever including the plaintext in the message:
// a wrong key, a changed ciphertext and a bundle of an unexpected shape all end up here.
export const openCredentials = (sealed: Sealed, keyBase64: string): Credentials => {
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
   const parsed = bundleSchema.safeParse(JSON.parse(plaintext.toString('utf8')))

   if (!parsed.success) {
      throw new Error('The credentials are not in the expected shape')
   }

   return parsed.data
}
