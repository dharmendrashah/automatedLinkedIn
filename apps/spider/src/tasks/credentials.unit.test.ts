import { createCipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { openCredentials, openProxyCredentials } from './credentials'

const KEY = Buffer.alloc(32, 7).toString('base64')

// The same sealing brain does: AES-256-GCM, base64 parts, a random 12 byte IV.
const seal = (plaintext: string, key = KEY) => {
   const iv = randomBytes(12)
   const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv)
   const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

   return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      key_version: 1,
   }
}

describe('openCredentials', () => {
   it('should open the bundle brain sealed', () => {
      const bundle = {
         password: 'hunter2',
         totpSecret: 'JBSWY3DPEHPK3PXP',
         session: 'li_at=AQEDARz1',
      }

      expect(openCredentials(seal(JSON.stringify(bundle)), KEY)).toEqual(bundle)
   })

   it('should accept a bundle with only some of the secrets', () => {
      const bundle = seal(JSON.stringify({ session: 'li_at=AQEDARz1' }))

      expect(openCredentials(bundle, KEY)).toEqual({ session: 'li_at=AQEDARz1' })
   })

   it('should refuse a bundle sealed with another key', () => {
      const other = Buffer.alloc(32, 9).toString('base64')

      expect(() => openCredentials(seal('{"password":"x"}', other), KEY)).toThrow()
   })

   it('should refuse a bundle that was changed after sealing', () => {
      const sealed = seal('{"password":"x"}')
      const bytes = Buffer.from(sealed.ciphertext, 'base64')

      bytes[0] ^= 1

      expect(() =>
         openCredentials(
            {
               ...sealed,
               ciphertext: bytes.toString('base64'),
            },
            KEY
         )
      ).toThrow()
   })

   it('should refuse a key version it does not know', () => {
      expect(() =>
         openCredentials(
            {
               ...seal('{"password":"x"}'),
               key_version: 2,
            },
            KEY
         )
      ).toThrow(/version/)
   })

   it('should refuse a worker key that is not 32 bytes', () => {
      expect(() => openCredentials(seal('{"password":"x"}'), Buffer.alloc(16).toString('base64'))).toThrow(/32/)
      expect(() => openCredentials(seal('{"password":"x"}'), '')).toThrow(/32/)
   })

   it('should refuse a bundle that is not the expected shape, without echoing it', () => {
      const attempt = () =>
         openCredentials(
            seal(
               JSON.stringify({
                  password: 123,
                  extra: 'TOPSECRET',
               })
            ),
            KEY
         )

      expect(attempt).toThrow()
      expect(attempt).not.toThrow(/TOPSECRET/)
   })
})

describe('openProxyCredentials', () => {
   it("should open a saved proxy's username and password", () => {
      const bundle = {
         username: 'proxyuser',
         password: 'hunter2',
      }

      expect(openProxyCredentials(seal(JSON.stringify(bundle)), KEY)).toEqual(bundle)
   })

   it('should accept a bundle with only one of the secrets', () => {
      expect(openProxyCredentials(seal(JSON.stringify({ password: 'x' })), KEY)).toEqual({ password: 'x' })
   })

   it('should refuse a bundle sealed with another key', () => {
      const other = Buffer.alloc(32, 9).toString('base64')

      expect(() => openProxyCredentials(seal('{"username":"x"}', other), KEY)).toThrow()
   })

   it('should refuse a bundle that is not the expected shape, without echoing it', () => {
      const attempt = () =>
         openProxyCredentials(
            seal(
               JSON.stringify({
                  username: 123,
                  extra: 'TOPSECRET',
               })
            ),
            KEY
         )

      expect(attempt).toThrow()
      expect(attempt).not.toThrow(/TOPSECRET/)
   })
})
