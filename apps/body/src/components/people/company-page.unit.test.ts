import { describe, expect, it } from 'vitest'

import { companyPageOf } from './company-page'

describe('companyPageOf', () => {
   it('opens the company drawer on /companies from the read company link', () => {
      expect(companyPageOf('https://www.linkedin.com/company/rivuletiq')).toBe('/companies?company=rivuletiq')
      expect(companyPageOf('https://www.linkedin.com/company/caf%C3%A9')).toBe('/companies?company=caf%C3%A9')
   })

   it('gives nothing without a LinkedIn company link', () => {
      expect(companyPageOf(null)).toBeNull()
      expect(companyPageOf(undefined)).toBeNull()
      expect(companyPageOf('https://example.com/company/kite')).toBeNull()
   })
})
