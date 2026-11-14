import { describe, expect, it } from 'vitest'

import { acceptLabel, rangeLabel } from './campaign-list-format'

describe('acceptLabel', () => {
   it('shows a dash when nothing was invited in the window', () => {
      expect(acceptLabel(null)).toBe('—')
   })

   it('caps the shown rate at 100% for invites sent before the window', () => {
      expect(acceptLabel(1.4)).toBe('100%')
      expect(acceptLabel(0.456)).toBe('46%')
   })
})

describe('rangeLabel', () => {
   it('collapses a range with equal ends to one number', () => {
      expect(rangeLabel({ low: 12, high: 12 })).toBe('12')
      expect(rangeLabel({ low: 12, high: 40 })).toBe('12–40')
   })
})
