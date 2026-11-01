import { describe, expect, it } from 'vitest'

import { postedText } from './post-row'

describe('post-row', () => {
   it('should show a posting date as time ago and keep any other text', () => {
      const now = new Date('2026-11-01T12:00:00Z')

      expect(postedText('2026-10-29', now)).toBe('3 days ago')
      expect(postedText('2w', now)).toBe('2w')
      expect(postedText(null, now)).toBeNull()
   })
})
