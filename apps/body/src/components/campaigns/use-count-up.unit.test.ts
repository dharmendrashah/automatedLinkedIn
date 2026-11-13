import { describe, expect, it } from 'vitest'

import { countUpValue } from './use-count-up'

describe('countUpValue', () => {
   it('starts at the old value and ends at the new one', () => {
      expect(countUpValue(10, 40, 0)).toBe(10)
      expect(countUpValue(10, 40, 1)).toBe(40)
   })

   it('rounds the value in between to a whole number', () => {
      expect(countUpValue(0, 10, 0.5)).toBe(5)
      expect(countUpValue(0, 10, 0.26)).toBe(3)
   })

   it('stops at the target when the progress runs past the end', () => {
      expect(countUpValue(0, 10, 1.7)).toBe(10)
   })

   it('counts down when the new value is lower', () => {
      expect(countUpValue(20, 0, 0.5)).toBe(10)
   })
})
