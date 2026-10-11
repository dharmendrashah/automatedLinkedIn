import { describe, expect, it } from 'vitest'

import { readableError } from './trpc-error'

describe('readableError', () => {
   it('should return a plain message as is', () => {
      expect(readableError({ message: 'A LinkedIn account with this email is already stored' })).toBe(
         'A LinkedIn account with this email is already stored'
      )
   })

   it('should turn validation issues into sentences', () => {
      const message = JSON.stringify([
         { code: 'custom', path: ['session'], message: 'We could not find li_at.' },
         { code: 'custom', path: ['totpSecret'], message: 'TOTP secret must be base32.' },
      ])

      expect(readableError({ message })).toBe('We could not find li_at. TOTP secret must be base32.')
   })

   it('should fall back to the raw message for JSON without usable issues', () => {
      expect(readableError({ message: '[]' })).toBe('[]')
      expect(readableError({ message: '{"a":1}' })).toBe('{"a":1}')
   })
})
