import { describe, expect, it } from 'vitest'

import { compactCount, fullCount } from './counts'

describe('counts', () => {
   it('should shorten a large count, and leave a small one alone', () => {
      expect(compactCount(905)).toBe('905')
      expect(compactCount(1500)).toBe('1.5K')
      expect(compactCount(12_248_563)).toBe('12.2M')
   })

   it('should group the digits of a full count', () => {
      expect(fullCount(954_799)).toBe('954,799')
      expect(fullCount(0)).toBe('0')
   })
})
