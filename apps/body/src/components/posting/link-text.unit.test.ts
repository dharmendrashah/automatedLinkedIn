import { describe, expect, it } from 'vitest'

import { ADDRESS_PROBLEM, addressProblem, normaliseAddress, withAddress } from './link-text'

describe('normaliseAddress', () => {
   it('should keep an https address and give a bare domain https', () => {
      expect(normaliseAddress('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
      expect(normaliseAddress('  example.com  ')).toBe('https://example.com')
      expect(normaliseAddress('www.example.co.uk/path')).toBe('https://www.example.co.uk/path')
   })

   it('should refuse http, other schemes, words and text with spaces', () => {
      expect(normaliseAddress('http://example.com')).toBeUndefined()
      expect(normaliseAddress('javascript:alert(1)')).toBeUndefined()
      expect(normaliseAddress('hello')).toBeUndefined()
      expect(normaliseAddress('two words.com')).toBeUndefined()
      expect(normaliseAddress('')).toBeUndefined()
      expect(normaliseAddress('e.g.')).toBeUndefined()
   })
})

describe('addressProblem', () => {
   it('should say nothing for a good address and a sentence for a bad one', () => {
      expect(addressProblem('example.com')).toBeUndefined()
      expect(addressProblem('')).toBeUndefined()
      expect(addressProblem('http://example.com')).toBe(ADDRESS_PROBLEM)
      expect(addressProblem('not a link')).toBe(ADDRESS_PROBLEM)
   })
})

describe('withAddress', () => {
   it('should put the address after the selection with a space before it, and the caret after it', () => {
      expect(withAddress('Read our guide today', 14, 'https://x.com')).toEqual({
         value: 'Read our guide https://x.com today',
         caret: 28,
      })
   })

   it('should not add a space where there is one, or at the ends', () => {
      expect(withAddress('Hello ', 6, 'https://x.com')).toEqual({
         value: 'Hello https://x.com',
         caret: 19,
      })
      expect(withAddress('Hello', 5, 'https://x.com')).toEqual({
         value: 'Hello https://x.com',
         caret: 19,
      })
      expect(withAddress('', 0, 'https://x.com')).toEqual({
         value: 'https://x.com',
         caret: 13,
      })
   })

   it('should leave a line break after the selection as it is', () => {
      expect(withAddress('Hello\nWorld', 5, 'https://x.com')).toEqual({
         value: 'Hello https://x.com\nWorld',
         caret: 19,
      })
   })
})
