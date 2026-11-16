import { describe, expect, it } from 'vitest'

import { text } from './snapshotFields'

const EMOJI = '\u{1F600}'
// A string Postgres JSON accepts has no half of a surrogate pair.
const wellFormed = (value: string) =>
   !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)

describe('text', () => {
   it('should keep normal text as it was: trimmed and cut to the length', () => {
      expect(text('  hello  ')).toBe('hello')
      expect(text('abcdef', 3)).toBe('abc')
      expect(text('   ')).toBeNull()
      expect(text(42)).toBeNull()
   })

   it('should drop the first half of an emoji the cut lands inside, so the text can be stored as JSON', () => {
      const cut = text(`ab${EMOJI}cd`, 3)

      expect(cut).toBe('ab')
      expect(wellFormed(cut ?? '')).toBe(true)
      expect(() => JSON.parse(JSON.stringify({ cut }))).not.toThrow()
   })

   it('should keep an emoji the cut leaves whole', () => {
      expect(text(`ab${EMOJI}cd`, 4)).toBe(`ab${EMOJI}`)
      expect(text(`ab${EMOJI}`)).toBe(`ab${EMOJI}`)
   })

   it('should drop a lone surrogate or a null character the data service sent', () => {
      expect(text('a\uD83Db')).toBe('ab')
      expect(text('a\uDE00b')).toBe('ab')
      expect(text('a\u0000b')).toBe('ab')
      expect(wellFormed(text(`x\uD83D${EMOJI}\uDE00y`) ?? '')).toBe(true)
   })

   it('should answer null when nothing is left after cleaning', () => {
      expect(text('\uD83D')).toBeNull()
      expect(text(' \u0000 ')).toBeNull()
   })
})
