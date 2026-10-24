import { describe, expect, it } from 'vitest'

import { linkedInHref } from './safe-link'

describe('linkedInHref', () => {
   it.each(['https://www.linkedin.com/in/sample/', 'https://linkedin.com/company/sample'])(
      'should link %s',
      address => {
         expect(linkedInHref(address)).toBe(address)
      }
   )

   it.each([
      undefined,
      '',
      'not an address',
      'http://www.linkedin.com/in/sample',
      'javascript:alert(1)',
      'https://example.com/in/sample',
      'https://notlinkedin.com/in/sample',
      'https://linkedin.com.evil.example/in/sample',
   ])('should not link %s', address => {
      expect(linkedInHref(address)).toBeUndefined()
   })
})
