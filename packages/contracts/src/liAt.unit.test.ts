import { describe, expect, it } from 'vitest'

import { extractLiAt } from './liAt'

const value = 'AQEDARz1x2aBcD3eFgHiJkLmNoPqRsTuVwXyZ0123456789-_abcdefghijklmnopqrstuvwxyz'

describe('extractLiAt', () => {
   it('should accept the bare value', () => {
      expect(extractLiAt(value)).toBe(value)
      expect(extractLiAt(`  "${value}"\n`)).toBe(value)
   })

   it('should accept li_at= on its own', () => {
      expect(extractLiAt(`li_at=${value}`)).toBe(value)
   })

   it('should read a Cookie header string', () => {
      expect(extractLiAt(`Cookie: bcookie="v=2&abc"; li_at=${value}; JSESSIONID="ajax:123"; lang=v=2`)).toBe(value)
   })

   it('should read a quoted value and a Set-Cookie line', () => {
      expect(extractLiAt(`JSESSIONID=x; li_at="${value}"; Path=/`)).toBe(value)
      expect(extractLiAt(`li_at=${value}; Domain=.www.linkedin.com; Path=/; Secure; HttpOnly`)).toBe(value)
   })

   it('should read a Cookie-Editor JSON array', () => {
      const json = JSON.stringify([
         {
            name: 'JSESSIONID',
            value: '"ajax:1"',
            domain: '.www.linkedin.com',
         },
         {
            name: 'li_at',
            value,
            domain: '.www.linkedin.com',
            httpOnly: true,
         },
      ])

      expect(extractLiAt(json)).toBe(value)
   })

   it('should read a Playwright storage state', () => {
      const json = JSON.stringify({
         cookies: [
            {
               name: 'li_at',
               value,
               domain: '.linkedin.com',
            },
         ],
         origins: [],
      })

      expect(extractLiAt(json)).toBe(value)
   })

   it('should read a Netscape cookies.txt line, including HttpOnly lines', () => {
      const text = [
         '# Netscape HTTP Cookie File',
         '.linkedin.com\tTRUE\t/\tTRUE\t1800000000\tlang\tv=2',
         `#HttpOnly_.www.linkedin.com\tTRUE\t/\tTRUE\t1800000000\tli_at\t${value}`,
      ].join('\r\n')

      expect(extractLiAt(text)).toBe(value)
   })

   it('should read rows copied from the browser cookie table', () => {
      const rows = [
         'JSESSIONID\t"ajax:123"\t.www.linkedin.com\t/\tSession\t30\t✓',
         `li_at\t${value}\t.www.linkedin.com\t/\t2027-10-11T10:00:00.000Z\t200\t✓\t✓`,
      ].join('\n')

      expect(extractLiAt(rows)).toBe(value)
   })

   it('should take the first li_at when several are present', () => {
      const other = `${value}ZZZ`

      expect(extractLiAt(`li_at=${value}; li_at=${other}`)).toBe(value)
   })

   it('should not match cookies that only look similar', () => {
      expect(() => extractLiAt(`li_a=${value}`)).toThrow('li_at')
      expect(() => extractLiAt(`li_rm=${value}; xli_at=${value}`)).toThrow('li_at')
      expect(() => extractLiAt(`li_at_x=${value}`)).toThrow('li_at')
   })

   it('should reject a dump without li_at', () => {
      expect(() => extractLiAt('JSESSIONID="ajax:123"; lang=v=2')).toThrow('li_at')
      expect(() =>
         extractLiAt(
            JSON.stringify([
               {
                  name: 'JSESSIONID',
                  value: 'x',
               },
            ])
         )
      ).toThrow('li_at')
   })

   it('should reject a different cookie pasted on its own', () => {
      expect(() => extractLiAt('JSESSIONID="ajax:1234567890123456789"')).toThrow('li_at')
   })

   it('should reject a value that is too short or has odd characters', () => {
      expect(() => extractLiAt('li_at=short')).toThrow('incomplete')
      expect(() => extractLiAt(`li_at=${value}<script>`)).toThrow('incomplete')
   })

   it('should not crash on malformed JSON', () => {
      expect(() => extractLiAt('[{"name":"li_at","value":')).toThrow('li_at')
   })

   it('should reject empty input', () => {
      expect(() => extractLiAt('   ')).toThrow('li_at')
   })

   it('should not echo the input in the error', () => {
      expect(() => extractLiAt('MySecretCookiePayload=abc123')).toThrow(/^(?!.*MySecretCookiePayload).*$/)
   })
})
