import { describe, expect, it } from 'vitest'

import { pickedFrom, shownAccounts, toggleAccount } from './accounts-pick'

const USABLE = ['a', 'b', 'c']

describe('pickedFrom', () => {
   it('should read the ids of the address, and nothing from an empty one', () => {
      expect(pickedFrom('a, b,,c')).toEqual(['a', 'b', 'c'])
      expect(pickedFrom('')).toEqual([])
      expect(pickedFrom(null)).toEqual([])
   })
})

describe('shownAccounts', () => {
   it('should show every readable account when none is picked, and only the picked ones that can be read otherwise', () => {
      expect(shownAccounts(USABLE, [])).toEqual(USABLE)
      expect(shownAccounts(USABLE, ['c', 'a'])).toEqual(['a', 'c'])
      expect(shownAccounts(USABLE, ['foreign', 'b'])).toEqual(['b'])
      expect(shownAccounts(USABLE, ['foreign'])).toEqual([])
   })
})

describe('toggleAccount', () => {
   it('should narrow from all to the rest when one is unchecked, in the order of the list', () => {
      expect(toggleAccount(USABLE, USABLE, 'b')).toEqual(['a', 'c'])
      expect(toggleAccount(USABLE, ['a', 'c'], 'b')).toEqual([])
      expect(toggleAccount(USABLE, ['c'], 'a')).toEqual(['a', 'c'])
   })

   it('should not let the last account be unchecked, and treat all of them as none picked', () => {
      expect(toggleAccount(USABLE, ['a'], 'a')).toEqual(['a'])
      expect(toggleAccount(['a'], ['a'], 'a')).toEqual([])
   })
})
