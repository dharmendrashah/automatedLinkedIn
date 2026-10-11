import { describe, expect, it, vi } from 'vitest'

import { CryptoService } from './crypto.service'

vi.mock('env', () => ({
   // A fixed base64 32-byte key so the round-trip is deterministic.
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
}))

describe('CryptoService', () => {
   it('should round-trip a secret', () => {
      const sealed = CryptoService.seal('hunter2')

      expect(CryptoService.open(sealed)).toBe('hunter2')
   })

   it('should not store the plaintext in the ciphertext', () => {
      const sealed = CryptoService.seal('hunter2')

      expect(sealed.ciphertext).not.toContain('hunter2')
      expect(Buffer.from(sealed.ciphertext, 'base64').toString('utf8')).not.toContain('hunter2')
   })

   it('should use a fresh IV so the same plaintext seals differently', () => {
      expect(CryptoService.seal('same').ciphertext).not.toBe(CryptoService.seal('same').ciphertext)
   })

   it('should reject ciphertext whose tag does not match', () => {
      const sealed = CryptoService.seal('hunter2')
      const tampered = Buffer.from(sealed.ciphertext, 'base64')
      tampered[0] ^= 0xff

      expect(() =>
         CryptoService.open({
            ...sealed,
            ciphertext: tampered.toString('base64'),
         })
      ).toThrow()
   })

   it('should handle unicode', () => {
      const sealed = CryptoService.seal('pâsswörd🔐')

      expect(CryptoService.open(sealed)).toBe('pâsswörd🔐')
   })
})
