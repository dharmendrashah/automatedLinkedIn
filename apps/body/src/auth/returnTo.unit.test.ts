import { describe, expect, it } from 'vitest'

import { returnToOf } from './returnTo'

describe('returnToOf', () => {
   it('accepts a same-origin path', () => {
      expect(returnToOf({ returnTo: '/profile?tab=1' })).toBe('/profile?tab=1')
   })

   it.each([
      undefined,
      null,
      {},
      { returnTo: 5 },
      { returnTo: 'https://evil.example' },
      { returnTo: '//evil.example' },
   ])('falls back to / for %j', state => {
      expect(returnToOf(state)).toBe('/')
   })
})
