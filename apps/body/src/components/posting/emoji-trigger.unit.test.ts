import { describe, expect, it } from 'vitest'

import { triggerAt } from './emoji-trigger'

describe('triggerAt', () => {
   it('should open for a colon and letters before the caret, at the start or after a space or a line break', () => {
      expect(triggerAt(':smi', 4)).toEqual({ start: 0, end: 4, query: 'smi' })
      expect(triggerAt('Great news :roc', 15)).toEqual({ start: 11, end: 15, query: 'roc' })
      expect(triggerAt('Line one\n:fi', 12)).toEqual({ start: 9, end: 12, query: 'fi' })
   })

   it('should follow the caret, not the end of the text', () => {
      expect(triggerAt('a :sm and more', 5)).toEqual({ start: 2, end: 5, query: 'sm' })
      expect(triggerAt('a :sm and more', 10)).toBeUndefined()
   })

   it('should stay closed for a bare colon, a time, an address, a colon after a word and a double colon', () => {
      expect(triggerAt(':', 1)).toBeUndefined()
      expect(triggerAt('Meet at 10:30', 13)).toBeUndefined()
      expect(triggerAt('see https://example.com', 23)).toBeUndefined()
      expect(triggerAt('Note:wow', 8)).toBeUndefined()
      expect(triggerAt('::smile', 7)).toBeUndefined()
   })

   it('should close when the text after the colon has a space or is too long', () => {
      expect(triggerAt(':smile now', 10)).toBeUndefined()
      expect(triggerAt(`:${'a'.repeat(21)}`, 22)).toBeUndefined()
      expect(triggerAt(`:${'a'.repeat(20)}`, 21)).toBeDefined()
   })

   it('should take digits, plus and minus in a name, and letters of any script', () => {
      expect(triggerAt(':+1', 3)?.query).toBe('+1')
      expect(triggerAt(':100', 4)?.query).toBe('100')
      expect(triggerAt(':कमल', 4)?.query).toBe('कमल')
   })

   it('should work next to an emoji', () => {
      expect(triggerAt('👍 :ok', 6)).toEqual({ start: 3, end: 6, query: 'ok' })
   })
})
