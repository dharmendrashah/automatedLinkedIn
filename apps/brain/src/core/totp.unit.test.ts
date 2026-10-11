import { describe, expect, it } from 'vitest'

import { parseTotpSecret } from './totp'

const secret = 'SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX'

describe('parseTotpSecret', () => {
   it('should read the secret from an otpauth URI', () => {
      expect(
         parseTotpSecret(
            `otpauth://totp/LinkedIn:dharmendrashaheagle+linkedin@gmail.com?secret=${secret}&issuer=LinkedIn`
         )
      ).toBe(secret)
   })

   it('should accept a bare base32 secret', () => {
      expect(parseTotpSecret(secret)).toBe(secret)
   })

   it('should normalize case, spaces, dashes and padding', () => {
      expect(parseTotpSecret('  swxc ks6w-42kv 2lum etno 5mxu cjie owdx====  ')).toBe(secret)
   })

   it('should normalize the secret inside a URI too', () => {
      expect(parseTotpSecret(`OTPAUTH://TOTP/x?issuer=a&secret=${secret.toLowerCase()}&digits=6`)).toBe(secret)
   })

   it('should reject an hotp URI', () => {
      expect(() => parseTotpSecret(`otpauth://hotp/x?secret=${secret}&counter=1`)).toThrow('time-based')
   })

   it('should reject a URI without a secret', () => {
      expect(() => parseTotpSecret('otpauth://totp/x?issuer=LinkedIn')).toThrow('secret')
   })

   it('should reject a malformed URI', () => {
      expect(() => parseTotpSecret('otpauth://')).toThrow()
   })

   it('should reject characters outside base32', () => {
      expect(() => parseTotpSecret('SWXCKS6W42KV2LU1')).toThrow('base32')
      expect(() => parseTotpSecret('swxcks6w42kv2lu!')).toThrow('base32')
   })

   it('should reject a secret that is too short', () => {
      expect(() => parseTotpSecret('ABCDEFGH')).toThrow('16')
   })

   it('should reject an empty value', () => {
      expect(() => parseTotpSecret('   ')).toThrow()
   })

   it('should not echo the input in the error', () => {
      expect(() => parseTotpSecret('not-a-valid-secret-1!')).toThrow(/^(?!.*not-a-valid-secret).*$/)
   })
})
