import { describe, expect, it } from 'vitest'

import {
   clear,
   describeSelection,
   empty,
   isSelected,
   range,
   resolve,
   selectAllMatching,
   selectVisible,
   toggle,
} from './selection'

const order = ['a', 'b', 'c', 'd', 'e']

describe('toggle and isSelected', () => {
   it('should select and unselect one row', () => {
      const one = toggle(empty, 'b')

      expect(isSelected(one, 'b')).toBe(true)
      expect(isSelected(one, 'c')).toBe(false)
      expect(isSelected(toggle(one, 'b'), 'b')).toBe(false)
   })

   it('should not change the selection it was given', () => {
      toggle(empty, 'a')

      expect(empty.ids.size).toBe(0)
   })
})

describe('range', () => {
   it('should select every row between two, in either direction, with both ends', () => {
      expect([...range(empty, order, 'b', 'd').ids]).toEqual(['b', 'c', 'd'])
      expect([...range(empty, order, 'd', 'b').ids]).toEqual(['b', 'c', 'd'])
   })

   it('should select just the one when the other end is not in the list', () => {
      expect([...range(empty, order, 'zzz', 'c').ids]).toEqual(['c'])
   })
})

describe('select all', () => {
   it('should select the rows on the list, and say how many that is', () => {
      const visible = selectVisible(order)

      expect(visible.ids.size).toBe(5)
      expect(describeSelection(visible, 5, 1203)).toEqual({ label: '5 selected', canSelectAllMatching: true })
   })

   it('should offer all matching only when there are more than the list shows, and select every one of them', () => {
      expect(describeSelection(selectVisible(order), 5, 5).canSelectAllMatching).toBe(false)

      const all = selectAllMatching()

      expect(isSelected(all, 'anything')).toBe(true)
      expect(describeSelection(all, 5, 1203)).toEqual({ label: 'All 1,203 selected', canSelectAllMatching: false })
   })

   it('should turn into a single row choice again when one row is unticked after select all', () => {
      const all = selectAllMatching()
      const without = toggle(all, 'c')

      expect(without.all).toBe(false)
      expect(isSelected(without, 'c')).toBe(false)
   })
})

describe('resolve', () => {
   it('should give the selected ids that are still in the list, in list order', () => {
      expect(resolve(toggle(toggle(empty, 'd'), 'b'), ['a', 'b', 'c', 'd'])).toEqual(['b', 'd'])
      expect(resolve(toggle(empty, 'gone'), ['a', 'b'])).toEqual([])
   })

   it('should give every matching id after select all', () => {
      expect(resolve(selectAllMatching(), ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
   })
})

describe('clear', () => {
   it('should empty the selection', () => {
      expect(clear().ids.size).toBe(0)
      expect(clear().all).toBe(false)
   })
})
