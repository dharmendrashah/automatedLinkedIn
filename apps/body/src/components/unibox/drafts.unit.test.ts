import { describe, expect, it } from 'vitest'

import { parseDrafts, setDraft } from './drafts'

describe('setDraft', () => {
   it('should keep the text of a conversation, and drop the draft when it is empty', () => {
      expect(setDraft({}, 'c1', 'Hello')).toEqual({ c1: 'Hello' })
      expect(setDraft({ c1: 'Hello', c2: 'x' }, 'c1', '   ')).toEqual({ c2: 'x' })
   })

   it('should return the same object when nothing changed', () => {
      const drafts = { c1: 'Hello' }

      expect(setDraft(drafts, 'c1', 'Hello')).toBe(drafts)
      expect(setDraft(drafts, 'c9', '')).toBe(drafts)
   })
})

describe('parseDrafts', () => {
   it('should read what was saved and drop what is not text', () => {
      expect(parseDrafts({ a: 'one', b: 2, c: '', d: '  ' })).toEqual({ a: 'one' })
   })

   it('should give nothing for anything that is not a plain object', () => {
      expect(parseDrafts(null)).toEqual({})
      expect(parseDrafts(['a'])).toEqual({})
      expect(parseDrafts('x')).toEqual({})
   })

   it('should cut a draft that is longer than a reply can be', () => {
      expect(parseDrafts({ a: 'x'.repeat(9000) }).a).toHaveLength(8000)
   })
})
