import { describe, expect, it } from 'vitest'

import { EMOJI_GROUPS, findEmoji, insertAt } from './emoji'

describe('insertAt', () => {
   it('should put the emoji at the caret and move the caret after it', () => {
      expect(insertAt('Hello world', 5, 5, '👋')).toEqual({
         value: 'Hello👋 world',
         caret: 7,
      })
   })

   it('should replace what is selected', () => {
      expect(insertAt('Hello world', 6, 11, '🌍')).toEqual({
         value: 'Hello 🌍',
         caret: 8,
      })
   })

   it('should add at the end when there is no caret', () => {
      expect(insertAt('Hi', null, null, '🙂')).toEqual({
         value: 'Hi🙂',
         caret: 4,
      })
   })
})

describe('EMOJI_GROUPS', () => {
   it('should have named groups, and every emoji once with a name', () => {
      const all = EMOJI_GROUPS.flatMap(({ items }) => items)

      expect(EMOJI_GROUPS.every(({ name, items }) => name !== '' && items.length > 0)).toBe(true)
      expect(all.every(({ name }) => /^[a-z0-9_+-]+$/.test(name))).toBe(true)
      expect(new Set(all.map(({ emoji }) => emoji)).size).toBe(all.length)
      expect(new Set(all.map(({ name }) => name)).size).toBe(all.length)
   })
})

describe('findEmoji', () => {
   it('should find an emoji by the start of its name first', () => {
      expect(findEmoji('rock')[0]?.emoji).toBe('🚀')
      expect(findEmoji('SMI')[0]?.name).toMatch(/^smile/)
   })

   it('should find by a word of the name, then by a keyword, then by a part of the name', () => {
      const names = findEmoji('up').map(({ name }) => name)

      expect(names).toContain('thumbs_up')
      expect(findEmoji('celebrate').map(({ emoji }) => emoji)).toContain('🎉')
      expect(findEmoji('ocket')[0]?.emoji).toBe('🚀')
   })

   it('should give at most eight, and nothing for nothing or for no match', () => {
      expect(findEmoji('s').length).toBeLessThanOrEqual(8)
      expect(findEmoji('')).toEqual([])
      expect(findEmoji('zzzzzz')).toEqual([])
   })
})
