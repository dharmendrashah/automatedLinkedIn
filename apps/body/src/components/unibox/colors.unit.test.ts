import { describe, expect, it } from 'vitest'

import { hueOf, initialsOf } from './colors'

describe('hueOf', () => {
   it('should give the same hue for the same account, within the colour wheel', () => {
      expect(hueOf('acc-01')).toBe(hueOf('acc-01'))
      expect(hueOf('acc-01')).toBeGreaterThanOrEqual(0)
      expect(hueOf('acc-01')).toBeLessThan(360)
   })

   it('should give different accounts different hues, mostly', () => {
      const hues = new Set(Array.from({ length: 12 }, (_, index) => hueOf(`acc-${String(index + 1).padStart(2, '0')}`)))

      expect(hues.size).toBeGreaterThanOrEqual(10)
   })
})

describe('initialsOf', () => {
   it('should give the first letters of the first and last word', () => {
      expect(initialsOf('Ruediger Niehoff')).toBe('RN')
      expect(initialsOf('  ada   king lovelace ')).toBe('AL')
      expect(initialsOf('Ada')).toBe('A')
   })

   it('should skip a flag or an emoji at the end of a name, and give a question mark for nothing', () => {
      expect(initialsOf('Ivan Baranenko 🇺🇦')).toBe('IB')
      expect(initialsOf('')).toBe('?')
      expect(initialsOf('🇺🇦')).toBe('?')
   })
})
