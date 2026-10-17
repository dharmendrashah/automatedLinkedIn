import { afterEach, describe, expect, it, vi } from 'vitest'

import { shortcutOf } from './shortcuts'

const press = (key: string, extra: Partial<Parameters<typeof shortcutOf>[0]> = {}) =>
   shortcutOf({
      key,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      target: null,
      ...extra,
   })

// Unit tests run without a DOM: a stand-in element is enough for the typing check.
class FakeElement {
   public isContentEditable = false
   public tagName: string
   private inDialog: boolean
   public constructor(tagName: string, inDialog = false) {
      this.tagName = tagName
      this.inDialog = inDialog
   }
   public closest() {
      return this.inDialog ? this : null
   }
}

describe('shortcuts', () => {
   afterEach(() => {
      vi.unstubAllGlobals()
   })

   it('should map the agreed keys', () => {
      expect(press('Tab')).toEqual({ action: 'add' })
      expect(press('Backspace')).toEqual({ action: 'remove' })
      expect(press('ArrowDown')).toEqual({
         action: 'move',
         direction: 'down',
      })
      expect(press('s', { metaKey: true })).toEqual({ action: 'save' })
      expect(press('Z', { ctrlKey: true, shiftKey: true })).toEqual({ action: 'redo' })
      expect(press('d', { ctrlKey: true })).toEqual({ action: 'duplicate' })
      expect(press('x')).toBeNull()
   })

   it('should ignore keys typed in a field or inside a dialog', () => {
      vi.stubGlobal('HTMLElement', FakeElement)

      expect(press('Backspace', { target: new FakeElement('INPUT') as unknown as EventTarget })).toBeNull()
      expect(press('Enter', { target: new FakeElement('BUTTON', true) as unknown as EventTarget })).toBeNull()
      expect(press('Backspace', { target: new FakeElement('DIV') as unknown as EventTarget })).toEqual({
         action: 'remove',
      })
   })
})
