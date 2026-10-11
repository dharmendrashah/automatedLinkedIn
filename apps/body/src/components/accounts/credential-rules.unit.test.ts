import { describe, expect, it } from 'vitest'

import {
   type Flags,
   type Values,
   buildPatch,
   effectiveFlags,
   hasChanges,
   missingFrom,
   noFlags,
} from './credential-rules'

const empty: Values = {
   password: '',
   totpSecret: '',
   session: '',
}

describe('effectiveFlags', () => {
   it('should count typed values', () => {
      expect(effectiveFlags({ ...empty, password: 'pw', session: ' li_at=abc ' })).toEqual({
         password: true,
         totpSecret: false,
         session: true,
      })
   })

   it('should ignore whitespace-only secrets but keep password as typed', () => {
      expect(effectiveFlags({ ...empty, session: '   ', totpSecret: '  ' })).toEqual(noFlags)
      expect(effectiveFlags({ ...empty, password: ' ' }).password).toBe(true)
   })

   it('should keep saved secrets that are not cleared', () => {
      const saved: Flags = { password: true, totpSecret: false, session: true }

      expect(effectiveFlags(empty, saved)).toEqual(saved)
   })

   it('should drop a saved secret once it is cleared, even if text is typed', () => {
      const saved: Flags = { password: true, totpSecret: true, session: false }
      const cleared: Flags = { password: true, totpSecret: false, session: false }

      expect(effectiveFlags({ ...empty, password: 'new' }, saved, cleared)).toEqual({
         password: false,
         totpSecret: true,
         session: false,
      })
   })
})

describe('missingFrom', () => {
   const flags = (over: Partial<Flags>): Flags => ({ ...noFlags, ...over })

   it('should ask for the email first', () => {
      expect(missingFrom(' ', flags({ password: true }))).toMatch(/email/)
   })

   it('should require a password or a cookie', () => {
      expect(missingFrom('a@b.com', noFlags)).toMatch(/password or a browser sign-in token/)
      expect(missingFrom('a@b.com', flags({ totpSecret: true }))).toMatch(/password or a browser sign-in token/)
   })

   it('should need the password for a two-step key', () => {
      expect(missingFrom('a@b.com', flags({ totpSecret: true, session: true }))).toMatch(/needs the password/)
   })

   it.each([
      ['password', flags({ password: true })],
      ['password and key', flags({ password: true, totpSecret: true })],
      ['cookie', flags({ session: true })],
      ['both', flags({ password: true, session: true })],
   ])('should accept %s', (_name, value) => {
      expect(missingFrom('a@b.com', value)).toBeUndefined()
   })
})

describe('buildPatch', () => {
   it('should leave blank fields unchanged, never clear them', () => {
      expect(buildPatch(empty, noFlags)).toEqual({
         password: undefined,
         totpSecret: undefined,
         session: undefined,
      })
   })

   it('should send typed values, trimming the key and the cookie but not the password', () => {
      expect(buildPatch({ password: ' pw ', totpSecret: ' KEY ', session: ' c ' }, noFlags)).toEqual({
         password: ' pw ',
         totpSecret: 'KEY',
         session: 'c',
      })
   })

   it('should send null for a removed secret even when text is typed', () => {
      expect(
         buildPatch({ ...empty, session: 'typed' }, { password: false, totpSecret: false, session: true })
      ).toMatchObject({ session: null })
   })
})

describe('hasChanges', () => {
   const none = buildPatch(empty, noFlags)

   it('should be false when nothing changed', () => {
      expect(hasChanges('a@b.com', 'a@b.com', none)).toBe(false)
      expect(hasChanges(' a@b.com ', 'a@b.com', none)).toBe(false)
   })

   it('should be true for a new email or any secret change', () => {
      expect(hasChanges('c@d.com', 'a@b.com', none)).toBe(true)
      expect(hasChanges('a@b.com', 'a@b.com', { ...none, password: 'x' })).toBe(true)
      expect(hasChanges('a@b.com', 'a@b.com', { ...none, session: null })).toBe(true)
   })
})
