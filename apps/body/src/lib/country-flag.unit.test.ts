import { describe, expect, it } from 'vitest'

import { flagOf } from './country-flag'

describe('flagOf', () => {
   it('gives the flag of a country named in English, whatever its case', () => {
      expect(flagOf('France')).toBe('🇫🇷')
      expect(flagOf('united states')).toBe('🇺🇸')
   })

   it('gives nothing for a place that is not a country', () => {
      expect(flagOf('Greater London')).toBeNull()
      expect(flagOf(null)).toBeNull()
   })
})
