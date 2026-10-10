import { describe, expect, it } from 'vitest'

import { toProfile } from './profile'

describe('toProfile', () => {
   it('maps standard OIDC claims', () => {
      expect(
         toProfile({
            sub: 'abc',
            name: 'Ada Lovelace',
            preferred_username: 'ada',
            email: 'ada@elitale.com',
            email_verified: true,
            groups: ['staff'],
         })
      ).toEqual({
         id: 'abc',
         displayName: 'Ada Lovelace',
         username: 'ada',
         email: 'ada@elitale.com',
         emailVerified: true,
         groups: ['staff'],
      })
   })

   it('falls back from name to username, email, then sub', () => {
      expect(toProfile({ sub: 's', preferred_username: 'ada', email: 'a@b.c' }).displayName).toBe('ada')
      expect(toProfile({ sub: 's', email: 'a@b.c' }).displayName).toBe('a@b.c')
      expect(toProfile({ sub: 's' }).displayName).toBe('s')
   })

   it('ignores a groups claim that is not a list of strings', () => {
      expect(toProfile({ sub: 's', groups: 'staff' }).groups).toEqual([])
      expect(toProfile({ sub: 's', groups: ['a', 1] }).groups).toEqual(['a'])
   })

   it('defaults optional fields', () => {
      expect(toProfile({ sub: 's' })).toEqual({
         id: 's',
         displayName: 's',
         username: undefined,
         email: undefined,
         emailVerified: false,
         groups: [],
      })
   })
})
