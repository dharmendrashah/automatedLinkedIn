import { describe, expect, it } from 'vitest'

import { statusOf } from './api-key-status'

const NOW = new Date('2026-01-10T00:00:00Z')

describe('statusOf', () => {
   it('is active with no expiry and no revoke', () => {
      expect(
         statusOf(
            {
               revokedAt: null,
               expiresAt: null,
            },
            NOW
         )
      ).toBe('active')
   })

   it('is active with an expiry date still in the future', () => {
      expect(
         statusOf(
            {
               revokedAt: null,
               expiresAt: '2026-02-01T00:00:00Z',
            },
            NOW
         )
      ).toBe('active')
   })

   it('is expired once its expiry date has passed', () => {
      expect(
         statusOf(
            {
               revokedAt: null,
               expiresAt: '2026-01-01T00:00:00Z',
            },
            NOW
         )
      ).toBe('expired')
   })

   it('is revoked regardless of its expiry date', () => {
      expect(
         statusOf(
            {
               revokedAt: '2026-01-05T00:00:00Z',
               expiresAt: '2026-02-01T00:00:00Z',
            },
            NOW
         )
      ).toBe('revoked')
   })

   it('treats a revoke the same as an expiry that has not been reached yet', () => {
      expect(
         statusOf(
            {
               revokedAt: '2026-01-05T00:00:00Z',
               expiresAt: null,
            },
            NOW
         )
      ).toBe('revoked')
   })
})
