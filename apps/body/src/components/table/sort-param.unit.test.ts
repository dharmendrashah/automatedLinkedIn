import { describe, expect, it } from 'vitest'

import { readSort, uniqueById, writeSort } from './sort-param'

describe('sort-param', () => {
   it('should read an allowed sort and its direction, and nothing else', () => {
      const allowed = ['createdAt', 'comments'] as const

      expect(readSort('comments.desc', allowed)).toEqual({
         by: 'comments',
         desc: true,
      })
      expect(readSort('createdAt.asc', allowed)).toEqual({
         by: 'createdAt',
         desc: false,
      })
      expect(readSort('name.desc', allowed)).toBeUndefined()
      expect(readSort(null, allowed)).toBeUndefined()
   })

   it('should write a sort back the same way', () => {
      expect(
         writeSort({
            by: 'comments',
            desc: true,
         })
      ).toBe('comments.desc')
      expect(writeSort(undefined)).toBeNull()
   })

   it('should keep the first of rows seen twice', () => {
      expect(uniqueById([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toEqual([{ id: 'a' }, { id: 'b' }])
   })
})
