import { describe, expect, it } from 'vitest'

import { postedText, summaryLine } from './post-row'

describe('post-row', () => {
   it('should lead the summary with the people found and say what is left', () => {
      expect(
         summaryLine({
            toWork: 12,
            done: 3,
            unread: 4,
            found: 1_038,
            qualified: 12,
         })
      ).toBe('1,038 people found, 12 qualified · 12 posts to work through, 4 not read yet')
      expect(
         summaryLine({
            toWork: 1,
            done: 0,
            unread: 0,
            found: 0,
            qualified: 0,
         })
      ).toBe('Nobody found from your posts yet · 1 post to work through')
   })

   it('should show a posting date as time ago and keep any other text', () => {
      const now = new Date('2026-11-01T12:00:00Z')

      expect(postedText('2026-10-29', now)).toBe('3 days ago')
      expect(postedText('2w', now)).toBe('2w')
      expect(postedText(null, now)).toBeNull()
   })
})
