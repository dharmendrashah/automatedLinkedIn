import { describe, expect, it } from 'vitest'

import { PROFILE_CONTRACT_VERSION, accountProfileSchema } from './profile'

const none = {
   items: [],
   total: 0,
}
const minimal = {
   contract: PROFILE_CONTRACT_VERSION,
   captured_at: '2026-10-24T10:00:00.000Z',
   name: 'Sample Person',
   verified: false,
   topSkills: [],
   services: [],
   experience: [],
   education: [],
   projects: none,
   skills: none,
   recommendations: {
      received: none,
      given: none,
   },
   languages: none,
   interests: {
      topVoices: [],
      companies: [],
      groups: [],
      newsletters: [],
      schools: [],
   },
   peopleYouMayKnow: [],
   youMightLike: [],
}

describe('accountProfileSchema', () => {
   it('should accept a profile that holds only a name, as a new account has', () => {
      expect(accountProfileSchema.safeParse(minimal).success).toBe(true)
   })

   it('should accept totals larger than the items kept, and links on linkedin.com', () => {
      const profile = {
         ...minimal,
         profileUrl: 'https://www.linkedin.com/in/sample-person/',
         skills: {
            items: [{ name: 'Leadership' }],
            total: 56,
         },
         peopleYouMayKnow: [
            {
               name: 'Sample Friend',
               url: 'https://linkedin.com/in/sample-friend',
               imageUrl: 'https://media.licdn.com/dms/image/sample',
            },
         ],
      }

      expect(accountProfileSchema.safeParse(profile).success).toBe(true)
   })

   it.each([
      [
         'an unknown key',
         {
            ...minimal,
            email: 'a@b.c',
         },
      ],
      [
         'an http picture',
         {
            ...minimal,
            imageUrl: 'http://media.licdn.com/dms/image/sample',
         },
      ],
      [
         'a picture that is not an address',
         {
            ...minimal,
            coverUrl: 'javascript:alert(1)',
         },
      ],
      [
         'a profile address on another site',
         {
            ...minimal,
            profileUrl: 'https://example.com/in/sample',
         },
      ],
      [
         'a look-alike host',
         {
            ...minimal,
            profileUrl: 'https://notlinkedin.com/in/sample',
         },
      ],
      [
         'a negative count',
         {
            ...minimal,
            followers: -1,
         },
      ],
      [
         'no name',
         {
            ...minimal,
            name: '',
         },
      ],
      [
         'another version',
         {
            ...minimal,
            contract: 2,
         },
      ],
   ])('should refuse %s', (_name, profile) => {
      expect(accountProfileSchema.safeParse(profile).success).toBe(false)
   })
})
