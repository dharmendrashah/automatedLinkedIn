import { describe, expect, it } from 'vitest'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

import { retryRefusal } from './sessionRetry'

const failed = {
   kind: 'VALIDATE_ACCOUNT' as const,
   status: 'FAILED' as const,
   outcome: 'ERROR',
   message: 'LinkedIn showed a page the check does not understand.',
}

describe('retryRefusal', () => {
   it('should allow a failed check that ended in an error', () => {
      expect(retryRefusal(failed)).toBeUndefined()
   })

   it('should allow a security check, where another address may help', () => {
      expect(
         retryRefusal({
            ...failed,
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         })
      ).toBeUndefined()
   })

   it.each([
      [
         'a session that is still running',
         {
            status: 'IN_PROGRESS' as const,
            outcome: null,
         },
         /finish/i,
      ],
      [
         'a session that succeeded',
         {
            status: 'SUCCEEDED' as const,
            outcome: 'VALID',
         },
         /nothing to fix/i,
      ],
      ['a rejected password', { outcome: 'INVALID_CREDENTIALS' }, /credentials/i],
      [
         'a rejected code',
         {
            outcome: 'NEEDS_REAUTH',
            message: 'LinkedIn did not accept the two-step code.',
         },
         /credentials/i,
      ],
      [
         'a missing credential',
         {
            outcome: 'NEEDS_REAUTH',
            message: 'No password or browser token is stored.',
         },
         /credentials/i,
      ],
      ['a run that is not an account check', { kind: 'SCRAPE' as const }, /cannot be tried again/i],
   ])('should refuse %s, and say why', (_name, overrides, reason) => {
      expect(
         retryRefusal({
            ...failed,
            ...overrides,
         })
      ).toMatch(reason)
   })
})
