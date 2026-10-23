import { describe, expect, it } from 'vitest'

import { fold, highlight, matches, tokensOf } from './search'

describe('tokensOf', () => {
   it('should split a query into lower case words without accents, and drop the empty ones', () => {
      expect(tokensOf('  Ruédiger   NIEHOFF ')).toEqual(['ruediger', 'niehoff'])
      expect(tokensOf('')).toEqual([])
   })
})

describe('matches', () => {
   const text = fold('Ruediger Niehoff — Acme Sales — Kurze Frage zu eurer Strategie')

   it('should need every word, in any order, anywhere', () => {
      expect(matches(text, tokensOf('frage acme'))).toBe(true)
      expect(matches(text, tokensOf('frage zzz'))).toBe(false)
   })

   it('should match everything when there is no word', () => {
      expect(matches(text, [])).toBe(true)
   })

   it('should match a word with an accent against one without', () => {
      expect(matches(fold('Ruédiger'), tokensOf('ruediger'))).toBe(true)
   })
})

describe('highlight', () => {
   it('should cut a text into pieces, marking those that match a word', () => {
      expect(highlight('Hello Ada, hello again', ['hello'])).toEqual([
         { text: 'Hello', match: true },
         { text: ' Ada, ', match: false },
         { text: 'hello', match: true },
         { text: ' again', match: false },
      ])
   })

   it('should give the whole text unmarked when there is no word, and take special characters as plain text', () => {
      expect(highlight('a.b', [])).toEqual([{ text: 'a.b', match: false }])
      expect(highlight('a.b a+b', ['.', '+'])).toEqual([
         { text: 'a', match: false },
         { text: '.', match: true },
         { text: 'b a', match: false },
         { text: '+', match: true },
         { text: 'b', match: false },
      ])
   })

   it('should give nothing for an empty text', () => {
      expect(highlight('', ['a'])).toEqual([])
   })
})
