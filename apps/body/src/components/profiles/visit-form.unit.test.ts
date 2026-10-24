import { describe, expect, it } from 'vitest'

import { accountChoices, isProfileLink, visitedText } from './visit-form'

describe('isProfileLink', () => {
   it.each([
      'https://www.linkedin.com/in/ada-lovelace/',
      'linkedin.com/in/ada-lovelace',
      '  http://uk.linkedin.com/in/ada-lovelace?trk=x ',
   ])('should take the link of a profile: %s', text => {
      expect(isProfileLink(text)).toBe(true)
   })

   it.each(['', 'https://www.linkedin.com/company/sample/', 'https://example.com/in/ada', 'ada lovelace', 'linkedin.com/in/'])(
      'should not take anything else: %j',
      text => {
         expect(isProfileLink(text)).toBe(false)
      }
   )
})

describe('accountChoices', () => {
   it('should let an account that is signed in be chosen, and say why another cannot', () => {
      expect(
         accountChoices([
            {
               id: 'a1',
               email: 'one@example.com',
               status: 'ACTIVE',
            },
            {
               id: 'a2',
               email: 'two@example.com',
               status: 'DISABLED',
            },
            {
               id: 'a3',
               email: 'three@example.com',
               status: 'NEEDS_REAUTH',
            },
         ])
      ).toEqual([
         {
            id: 'a1',
            email: 'one@example.com',
         },
         {
            id: 'a2',
            email: 'two@example.com',
            blocker: 'Paused. Resume it first.',
         },
         {
            id: 'a3',
            email: 'three@example.com',
            blocker: 'Not signed in. Run Test login first.',
         },
      ])
   })
})

describe('visitedText', () => {
   const now = new Date('2026-10-24T12:00:00Z')

   it('should say when and by which account a profile was viewed', () => {
      expect(
         visitedText(
            {
               createdAt: '2026-10-22T12:00:00Z',
               account: { email: 'one@example.com' },
            },
            now
         )
      ).toBe('Viewed 2 days ago by one@example.com')
   })

   it('should say nothing for a profile nobody viewed', () => {
      expect(visitedText(undefined, now)).toBeUndefined()
   })
})
