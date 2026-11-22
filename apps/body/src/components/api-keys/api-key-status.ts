export type ApiKeyStatus = 'active' | 'expired' | 'revoked'

// A key is revoked once and for good; past that, an expiry date (if any) decides whether it still authenticates.
export const statusOf = (
   key: { revokedAt: string | Date | null; expiresAt: string | Date | null },
   now: Date = new Date()
): ApiKeyStatus => {
   if (key.revokedAt) {
      return 'revoked'
   }

   if (key.expiresAt && new Date(key.expiresAt) <= now) {
      return 'expired'
   }

   return 'active'
}
