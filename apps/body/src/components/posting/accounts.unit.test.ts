import { describe, expect, it } from 'vitest'

import { ineligibleReason, identityOf } from './accounts'

describe('identityOf', () => {
   const account = {
      email: 'ada@example.com',
      displayName: 'Ada L.',
      imageUrl: 'https://media.licdn.com/a.jpg',
   }

   it('should show the stored profile when there is one', () => {
      expect(
         identityOf(account, {
            name: 'Ada Lovelace',
            headline: 'Mathematician',
            imageUrl: 'https://media.licdn.com/p.jpg',
         })
      ).toEqual({
         name: 'Ada Lovelace',
         headline: 'Mathematician',
         imageUrl: 'https://media.licdn.com/p.jpg',
         known: true,
      })
   })

   it('should fall back to the name and picture LinkedIn showed for the account, then to the email', () => {
      expect(identityOf(account, null)).toEqual({
         name: 'Ada L.',
         headline: undefined,
         imageUrl: 'https://media.licdn.com/a.jpg',
         known: true,
      })
      expect(identityOf({ email: 'ada@example.com', displayName: null, imageUrl: null }, undefined)).toEqual({
         name: 'ada@example.com',
         headline: undefined,
         imageUrl: undefined,
         known: false,
      })
   })

   it('should take the picture of the profile only when the profile has one', () => {
      expect(identityOf(account, { name: 'Ada Lovelace' }).imageUrl).toBe('https://media.licdn.com/a.jpg')
   })
})

describe('ineligibleReason', () => {
   it('should let only an active account be picked', () => {
      expect(ineligibleReason('ACTIVE')).toBeUndefined()
   })

   it('should say what to do for every other status', () => {
      for (const status of ['PENDING', 'NEEDS_REAUTH', 'ERROR', 'DISABLED', 'BLOCKED'] as const) {
         expect(ineligibleReason(status)).toMatch(/\.$/)
      }

      expect(ineligibleReason('DISABLED')).toMatch(/Resume/)
      expect(ineligibleReason('NEEDS_REAUTH')).toMatch(/sign in/i)
   })
})
