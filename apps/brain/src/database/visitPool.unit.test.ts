import { describe, expect, it } from 'vitest'

import { idleFirst } from './visitPool'

describe('idleFirst', () => {
   it('should put an account that never visited first, then the one that went longest without a visit', () => {
      const last = new Map([
         ['a', new Date('2026-10-25T10:00:00Z')],
         ['b', new Date('2026-10-25T08:00:00Z')],
      ])

      expect(idleFirst(['a', 'b', 'c'], last)).toEqual(['c', 'b', 'a'])
   })

   it('should keep the order the owner listed them in when they tie', () => {
      expect(idleFirst(['x', 'y', 'z'], new Map())).toEqual(['x', 'y', 'z'])
      expect(
         idleFirst(
            ['y', 'x'],
            new Map([
               ['x', new Date(1000)],
               ['y', new Date(1000)],
            ])
         )
      ).toEqual(['y', 'x'])
   })
})
