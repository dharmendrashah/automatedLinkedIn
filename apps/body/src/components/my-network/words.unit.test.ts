import { describe, expect, it } from 'vitest'

import { foundByWord } from './words'

describe('foundByWord', () => {
   it('names the sources and the lists of the client', () => {
      const lists = [{ id: 'l1', name: 'Post commenters' }]

      expect(foundByWord('request', lists)).toBe('Requests')
      expect(foundByWord('list:l1', lists)).toBe('Post commenters')
      expect(foundByWord('list:gone', lists)).toBe('A list')
   })
})
