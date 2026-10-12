import { describe, expect, it } from 'vitest'

import { totpCode } from './totp'

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string 12345678901234567890. The table lists eight digits;
// six digits are the last six of the same number.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totpCode', () => {
   it.each([
      [59, '287082'],
      [1_111_111_109, '081804'],
      [1_111_111_111, '050471'],
      [1_234_567_890, '005924'],
      [2_000_000_000, '279037'],
      [20_000_000_000, '353130'],
   ])('should give the RFC 6238 code for second %i', (seconds, code) => {
      expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code)
   })

   it('should keep leading zeros', () => {
      expect(totpCode(RFC_SECRET, 1_111_111_109 * 1000)).toBe('081804')
   })

   it('should give the same code for the whole 30 second window and a new one in the next', () => {
      const start = 1_111_111_110 * 1000

      expect(totpCode(RFC_SECRET, start)).toBe(totpCode(RFC_SECRET, start + 29_999))
      expect(totpCode(RFC_SECRET, start)).not.toBe(totpCode(RFC_SECRET, start + 30_000))
   })

   it('should accept a secret with spaces, dashes, padding and lower case, as authenticator apps show it', () => {
      expect(totpCode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq====', 59_000)).toBe('287082')
   })

   it('should reject a secret that is not base32, without echoing it', () => {
      const attempt = () => totpCode('not-base32-SECRET!', 0)

      expect(attempt).toThrow(/base32/)
      expect(attempt).not.toThrow(/SECRET/)
   })
})
