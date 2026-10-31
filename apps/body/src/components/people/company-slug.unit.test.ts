import { describe, expect, it } from 'vitest'

import { companySlugOf } from './company-slug'

describe('companySlugOf', () => {
   it('reads the company of /companies from the read company link', () => {
      expect(companySlugOf('https://www.linkedin.com/company/rivuletiq')).toBe('rivuletiq')
      expect(companySlugOf('https://www.linkedin.com/company/caf%C3%A9')).toBe('café')
   })

   it('gives nothing without a LinkedIn company link', () => {
      expect(companySlugOf(null)).toBeNull()
      expect(companySlugOf(undefined)).toBeNull()
      expect(companySlugOf('https://example.com/company/kite')).toBeNull()
   })
})
