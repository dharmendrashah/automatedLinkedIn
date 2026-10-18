import { type DecipherGCM, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Transform } from 'node:stream'

import { keyOf } from '../tasks/credentials'

// A sealed stream: this tag, the IV, the AES-256-GCM ciphertext, then the auth tag. The tag is checked at the very end, so
// a reader must throw away what it made of a stream that fails.
const MAGIC = Buffer.from('ALP1')
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = MAGIC.length + IV_BYTES

// Seals a stream of any size with the credentials key, piece by piece, so memory stays flat.
export const sealStream = (keyBase64: string) => {
   const iv = randomBytes(IV_BYTES)
   const cipher = createCipheriv('aes-256-gcm', keyOf(keyBase64), iv)
   let started = false

   return new Transform({
      transform(chunk: Buffer, _encoding, done) {
         if (!started) {
            started = true
            this.push(Buffer.concat([MAGIC, iv]))
         }

         done(null, cipher.update(chunk))
      },
      flush(done) {
         if (!started) {
            this.push(Buffer.concat([MAGIC, iv]))
         }

         this.push(cipher.final())
         done(null, cipher.getAuthTag())
      },
   })
}

// The other way. The last 16 bytes are held back until the end, where they are the auth tag.
export const unsealStream = (keyBase64: string) => {
   const key = keyOf(keyBase64)
   let header = Buffer.alloc(0)
   let decipher: DecipherGCM | undefined
   let tail = Buffer.alloc(0)

   return new Transform({
      transform(chunk: Buffer, _encoding, done) {
         let data = chunk

         if (!decipher) {
            header = Buffer.concat([header, data])

            if (header.length < HEADER_BYTES) {
               done()

               return
            }

            if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
               done(new Error('This is not a sealed profile'))

               return
            }

            decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length, HEADER_BYTES))
            data = header.subarray(HEADER_BYTES)
         }

         const held = Buffer.concat([tail, data])
         const cut = Math.max(0, held.length - TAG_BYTES)

         tail = held.subarray(cut)
         done(null, decipher.update(held.subarray(0, cut)))
      },
      flush(done) {
         if (!decipher || tail.length < TAG_BYTES) {
            done(new Error('The sealed profile is cut short'))

            return
         }

         try {
            decipher.setAuthTag(tail)
            done(null, decipher.final())
         } catch {
            done(new Error('The sealed profile was changed or sealed with another key'))
         }
      },
   })
}
