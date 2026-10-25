import { describe, expect, it } from 'vitest'

import { SEE_MORE, seeMore, splitText } from './preview-text'

describe('splitText', () => {
   it('should keep plain text whole and mark hashtags and links', () => {
      expect(splitText('Hello #Sales team, read https://example.com/a?b=1 now')).toEqual([
         {
            kind: 'text',
            value: 'Hello ',
         },
         {
            kind: 'hashtag',
            value: '#Sales',
         },
         {
            kind: 'text',
            value: ' team, read ',
         },
         {
            kind: 'link',
            value: 'https://example.com/a?b=1',
         },
         {
            kind: 'text',
            value: ' now',
         },
      ])
   })

   it('should leave the punctuation after a link out of it', () => {
      expect(splitText('See https://example.com/a.')).toEqual([
         {
            kind: 'text',
            value: 'See ',
         },
         {
            kind: 'link',
            value: 'https://example.com/a',
         },
         {
            kind: 'text',
            value: '.',
         },
      ])
   })

   it('should not take a number sign inside a word or a lone # for a hashtag, and should know non-latin hashtags', () => {
      expect(splitText('C# and #1 and # and a#b')).toEqual([{ kind: 'text', value: 'C# and ' }, { kind: 'hashtag', value: '#1' }, { kind: 'text', value: ' and # and a#b' }])
      expect(splitText('#विकास')).toEqual([{ kind: 'hashtag', value: '#विकास' }])
   })

   it('should only treat https and http addresses as links, never other schemes', () => {
      expect(splitText('javascript:alert(1)')).toEqual([{ kind: 'text', value: 'javascript:alert(1)' }])
   })

   it('should give nothing for nothing', () => {
      expect(splitText('')).toEqual([])
   })
})

describe('seeMore', () => {
   it('should show a short text whole', () => {
      expect(seeMore('Short post')).toEqual({
         shown: 'Short post',
         cut: false,
      })
   })

   it('should cut a long text at a word near the character limit', () => {
      const text = `${'word '.repeat(80)}end`
      const { shown, cut } = seeMore(text)

      expect(cut).toBe(true)
      expect(shown.length).toBeLessThanOrEqual(SEE_MORE.chars)
      expect(shown.endsWith(' ')).toBe(false)
      expect(text.startsWith(shown)).toBe(true)
   })

   it('should cut after the third line, however short the lines are', () => {
      expect(seeMore('one\ntwo\nthree\nfour\nfive')).toEqual({
         shown: 'one\ntwo\nthree',
         cut: true,
      })
   })

   it('should not cut an emoji in two', () => {
      const text = '😀'.repeat(300)
      const { shown } = seeMore(text)

      expect(Array.from(shown).every(character => character === '😀')).toBe(true)
   })
})
