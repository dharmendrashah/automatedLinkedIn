import { describe, expect, it } from 'vitest'

import { secondsUntilNextCode, totpCode } from './totp-code'

// Same RFC 6238 vectors as the spider's totpCode (apps/spider/src/tasks/linkedinLogin/totp.ts): the secret is the
// ASCII string 12345678901234567890, base32 encoded.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totpCode', () => {
   it.each([
      [59, '287082'],
      [1_111_111_109, '081804'],
      [1_111_111_111, '050471'],
      [1_234_567_890, '005924'],
      [2_000_000_000, '279037'],
   ])('should give the RFC 6238 code for second %i', async (seconds, code) => {
      await expect(totpCode(RFC_SECRET, seconds * 1000)).resolves.toBe(code)
   })

   it('should accept a secret with spaces and lowercase letters', async () => {
      await expect(totpCode(RFC_SECRET.toLowerCase().replace(/(.{4})/g, '$1 '), 59_000)).resolves.toBe('287082')
   })

   it('should reject a secret that is not base32', async () => {
      await expect(totpCode('not-base32!', 0)).rejects.toThrow('base32')
   })
})

describe('secondsUntilNextCode', () => {
   it('should count down within a 30 second window and wrap to 30 at the boundary', () => {
      expect(secondsUntilNextCode(0)).toBe(30)
      expect(secondsUntilNextCode(1_000)).toBe(29)
      expect(secondsUntilNextCode(29_000)).toBe(1)
      expect(secondsUntilNextCode(30_000)).toBe(30)
   })
})
