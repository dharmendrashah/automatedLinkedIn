import { createHmac } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD_SECONDS = 30
const DIGITS = 6

const base32Decode = (input: string) => {
   const text = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
   const bytes: number[] = []
   let bits = 0
   let buffer = 0

   for (const char of text) {
      const value = ALPHABET.indexOf(char)

      if (value === -1) {
         // Never echoes the secret.
         throw new Error('The two-step key is not valid base32')
      }

      buffer = (buffer << 5) | value
      bits += 5

      if (bits >= 8) {
         bytes.push((buffer >>> (bits - 8)) & 0xff)
         bits -= 8
      }
   }

   return Buffer.from(bytes)
}

// RFC 6238 time-based one-time password with the parameters LinkedIn and authenticator apps use: SHA-1, six
// digits, thirty seconds.
export const totpCode = (secret: string, atMs: number) => {
   const counter = Buffer.alloc(8)

   counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / PERIOD_SECONDS)))

   const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest()
   const offset = digest[digest.length - 1] & 0x0f
   const binary = digest.readUInt32BE(offset) & 0x7fffffff

   return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}
