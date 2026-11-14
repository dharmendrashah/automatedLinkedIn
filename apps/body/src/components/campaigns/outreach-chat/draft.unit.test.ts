import { describe, expect, it } from 'vitest'

import { freshDraft, parseDraft } from './draft'

describe('parseDraft', () => {
   it('gives back what was saved', () => {
      const saved = { ...freshDraft('UTC'), done: ['name' as const] }

      expect(parseDraft(JSON.stringify(saved), 'Asia/Kolkata')).toEqual(saved)
   })

   it('starts a fresh chat when the stored text is missing, broken, or from an older shape', () => {
      const fresh = freshDraft('Asia/Kolkata')

      expect(parseDraft(null, 'Asia/Kolkata')).toEqual(fresh)
      expect(parseDraft('{oops', 'Asia/Kolkata')).toEqual(fresh)
      expect(parseDraft('{"form":{"name":"x"},"done":[]}', 'Asia/Kolkata')).toEqual(fresh)
      expect(parseDraft(JSON.stringify({ ...freshDraft('UTC'), done: ['nope'] }), 'Asia/Kolkata')).toEqual(fresh)
   })
})
