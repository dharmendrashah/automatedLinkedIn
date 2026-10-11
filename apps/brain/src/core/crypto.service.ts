import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { LINKEDIN_CRED_ENC_KEY } from 'env'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

export type Sealed = {
   ciphertext: string
   iv: string
   tag: string
}

// Authenticated encryption (AES-256-GCM) for secrets that must be read back, not just verified.
// Values are base64. A random IV per call means the same plaintext never yields the same ciphertext.
export class CryptoService {
   private static key() {
      return Buffer.from(LINKEDIN_CRED_ENC_KEY, 'base64')
   }

   public static seal(plaintext: string): Sealed {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, CryptoService.key(), iv)
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

      return {
         ciphertext: ciphertext.toString('base64'),
         iv: iv.toString('base64'),
         tag: cipher.getAuthTag().toString('base64'),
      }
   }

   public static open({ ciphertext, iv, tag }: Sealed): string {
      const decipher = createDecipheriv(ALGORITHM, CryptoService.key(), Buffer.from(iv, 'base64'))

      decipher.setAuthTag(Buffer.from(tag, 'base64'))

      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
   }
}
