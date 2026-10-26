import { describe, expect, it } from 'vitest'

import { SHORTCUTS, modKey } from './shortcuts'

describe('modKey', () => {
   it('should be the command key on a Mac and Ctrl elsewhere', () => {
      expect(modKey('MacIntel')).toBe('⌘')
      expect(modKey('iPhone')).toBe('⌘')
      expect(modKey('Win32')).toBe('Ctrl')
      expect(modKey('Linux x86_64')).toBe('Ctrl')
      expect(modKey(undefined)).toBe('Ctrl')
   })
})

describe('SHORTCUTS', () => {
   it('should write every shortcut with its keys and what it does, using the key of the machine', () => {
      const list = SHORTCUTS('⌘')

      expect(list.length).toBeGreaterThanOrEqual(4)
      expect(list.every(({ keys, does }) => keys.length > 0 && does !== '')).toBe(true)
      expect(list.some(({ keys }) => keys.includes('⌘'))).toBe(true)
   })
})
