import { describe, expect, it } from 'vitest'

import { spreadByRoom } from './inviteSpread'

const names = (map: Map<string, string[]>, id: string) => map.get(id) ?? []

describe('spreadByRoom', () => {
   it('should give people to accounts in proportion to their room, not in turn', () => {
      const { given, over } = spreadByRoom(
         ['a', 'b', 'c', 'd', 'e', 'f'],
         [
            {
               accountId: 'big',
               within: 4,
            },
            {
               accountId: 'small',
               within: 2,
            },
         ]
      )

      expect(names(given, 'big')).toEqual(['a', 'b', 'c', 'e'])
      expect(names(given, 'small')).toEqual(['d', 'f'])
      expect(over).toEqual([])
   })

   it('should leave out the people no room holds, and the last ones first', () => {
      const { given, over } = spreadByRoom(
         ['a', 'b', 'c'],
         [
            {
               accountId: 'one',
               within: 1,
            },
            {
               accountId: 'none',
               within: 0,
            },
         ]
      )

      expect(names(given, 'one')).toEqual(['a'])
      expect(names(given, 'none')).toEqual([])
      expect(over).toEqual(['b', 'c'])
   })

   it('should leave everyone out when there is no account', () => {
      expect(spreadByRoom(['a'], []).over).toEqual(['a'])
   })
})
