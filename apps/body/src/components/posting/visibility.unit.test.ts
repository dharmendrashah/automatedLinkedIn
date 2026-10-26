import { describe, expect, it } from 'vitest'

import { VISIBILITY_LABELS, reachText, restrictionText } from './visibility'

describe('post visibility', () => {
   it('should name each choice in words the owner knows', () => {
      expect(VISIBILITY_LABELS).toEqual({
         ANYONE: 'Anyone',
         CONNECTIONS: 'Connections only',
      })
   })

   it('should say who can see and comment, for the confirmation', () => {
      expect(reachText('ANYONE', 'ANYONE')).toBe('Anyone on LinkedIn can see it and comment on it.')
      expect(reachText('CONNECTIONS', 'CONNECTIONS')).toBe('Only your connections can see it and comment on it.')
      expect(reachText('ANYONE', 'CONNECTIONS')).toBe('Anyone on LinkedIn can see it, and only your connections can comment on it.')
      expect(reachText('CONNECTIONS', 'ANYONE')).toBe('Only your connections can see it and comment on it.')
   })

   it('should say nothing when both are anyone, and what is held back otherwise', () => {
      expect(restrictionText('ANYONE', 'ANYONE')).toBeUndefined()
      expect(restrictionText('CONNECTIONS', 'ANYONE')).toBe('Seen by connections only')
      expect(restrictionText('ANYONE', 'CONNECTIONS')).toBe('Comments from connections only')
      expect(restrictionText('CONNECTIONS', 'CONNECTIONS')).toBe('Seen and commented on by connections only')
   })
})
