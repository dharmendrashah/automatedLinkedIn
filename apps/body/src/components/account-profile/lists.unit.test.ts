import { describe, expect, it } from 'vitest'

import { slice, totalOf } from './lists'

describe('slice', () => {
   const items = [1, 2, 3, 4, 5]

   it('should give the first items and how many are left', () => {
      expect(slice(items, 3, false)).toEqual({
         visible: [1, 2, 3],
         hidden: 2,
      })
   })

   it('should give them all once opened, and nothing left over for a short list', () => {
      expect(slice(items, 3, true).visible).toEqual(items)
      expect(slice([1, 2], 3, false)).toEqual({
         visible: [1, 2],
         hidden: 0,
      })
   })
})

describe('totalOf', () => {
   it('should use the total the page showed, and the length when it showed none', () => {
      expect(totalOf({ items: [1, 2], total: 56 })).toBe(56)
      expect(totalOf({ items: [1, 2] })).toBe(2)
   })

   it('should never say fewer than what was kept', () => {
      expect(totalOf({ items: [1, 2, 3], total: 1 })).toBe(3)
   })
})
