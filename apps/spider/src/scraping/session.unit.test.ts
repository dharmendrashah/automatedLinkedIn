import { describe, expect, it } from 'vitest'

import { parseSessionCookies } from './session'

const cookie = {
   name: 'sid',
   value: 'abc',
   domain: '.example.com',
   path: '/',
}

describe('parseSessionCookies', () => {
   it('should read a plain cookie array', () => {
      expect(parseSessionCookies(JSON.stringify([cookie]))).toEqual([cookie])
   })

   it('should read a Playwright storage state', () => {
      expect(
         parseSessionCookies(
            JSON.stringify({
               cookies: [cookie],
               origins: [],
            })
         )
      ).toEqual([cookie])
   })

   it('should keep optional cookie fields and drop unknown ones', () => {
      const full = {
         ...cookie,
         expires: 1_900_000_000,
         httpOnly: true,
         secure: true,
         sameSite: 'Lax',
         extra: 'ignored',
      }
      const [parsed] = parseSessionCookies(JSON.stringify([full]))

      expect(parsed).toEqual({
         ...cookie,
         expires: 1_900_000_000,
         httpOnly: true,
         secure: true,
         sameSite: 'Lax',
      })
   })

   it('should reject text that is not json, not a cookie list, or has an incomplete cookie', () => {
      expect(() => parseSessionCookies('nope')).toThrow(/session/)
      expect(() => parseSessionCookies('{"a":1}')).toThrow(/session/)
      expect(() => parseSessionCookies(JSON.stringify([{ name: 'sid' }]))).toThrow(/session/)
      expect(() => parseSessionCookies('[]')).toThrow(/no cookies/)
   })

   it('should not echo cookie values in errors', () => {
      expect(() =>
         parseSessionCookies(
            JSON.stringify([
               {
                  name: 'sid',
                  value: 'TOPSECRET',
               },
            ])
         )
      ).toThrow(/^(?!.*TOPSECRET).*$/)
   })
})
