import { describe, expect, it } from 'vitest'

import { commandFor, escapeStep, isTyping } from './keyboard'

const key = (name: string, over: Partial<Parameters<typeof commandFor>[0]> = {}) => ({
   key: name,
   ctrlKey: false,
   metaKey: false,
   altKey: false,
   shiftKey: false,
   ...over,
})

describe('commandFor', () => {
   it('should move, open, reply, close, mark unread, select, search and ask for help with single keys', () => {
      expect(commandFor(key('j'), false)).toBe('NEXT')
      expect(commandFor(key('ArrowDown'), false)).toBe('NEXT')
      expect(commandFor(key('k'), false)).toBe('PREVIOUS')
      expect(commandFor(key('ArrowUp'), false)).toBe('PREVIOUS')
      expect(commandFor(key('Enter'), false)).toBe('OPEN')
      expect(commandFor(key('r'), false)).toBe('REPLY')
      expect(commandFor(key('e'), false)).toBe('DONE')
      expect(commandFor(key('u'), false)).toBe('UNREAD')
      expect(commandFor(key('x'), false)).toBe('SELECT')
      expect(commandFor(key('/'), false)).toBe('SEARCH')
      expect(commandFor(key('c'), false)).toBe('COMPOSE')
      expect(commandFor(key('?', { shiftKey: true }), false)).toBe('HELP')
   })

   it('should do nothing with a single key while a text box has the focus', () => {
      for (const name of ['j', 'k', 'r', 'e', 'u', 'x', 'c', '/', 'Enter', 'ArrowDown']) {
         expect(commandFor(key(name), true)).toBeUndefined()
      }
   })

   it('should open the palette with Ctrl or Cmd K, even while typing', () => {
      expect(commandFor(key('k', { ctrlKey: true }), true)).toBe('PALETTE')
      expect(commandFor(key('K', { metaKey: true }), false)).toBe('PALETTE')
   })

   it('should leave every other chord to the browser', () => {
      for (const over of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
         expect(commandFor(key('r', over), false)).toBeUndefined()
         expect(commandFor(key('j', over), false)).toBeUndefined()
      }
   })

   it('should know nothing of other keys', () => {
      expect(commandFor(key('z'), false)).toBeUndefined()
      expect(commandFor(key('Escape'), false)).toBeUndefined()
   })
})

describe('isTyping', () => {
   it('should say a text box, a text area, a menu field and an editable region are typing', () => {
      expect(isTyping({ tagName: 'INPUT', isContentEditable: false })).toBe(true)
      expect(isTyping({ tagName: 'textarea', isContentEditable: false })).toBe(true)
      expect(isTyping({ tagName: 'SELECT', isContentEditable: false })).toBe(true)
      expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true)
      expect(isTyping({ tagName: 'DIV', isContentEditable: false, role: 'textbox' })).toBe(true)
   })

   it('should say a button, a row and the page are not', () => {
      expect(isTyping({ tagName: 'BUTTON', isContentEditable: false })).toBe(false)
      expect(isTyping({ tagName: 'DIV', isContentEditable: false, role: 'option' })).toBe(false)
      expect(isTyping(null)).toBe(false)
   })
})

describe('escapeStep', () => {
   const none = { palette: false, menu: false, details: false, composer: false, selection: false, thread: false }

   it('should close one thing at a time, in a fixed order', () => {
      const all = { palette: true, menu: true, details: true, composer: true, selection: true, thread: true }

      expect(escapeStep(all)).toBe('CLOSE_PALETTE')
      expect(escapeStep({ ...all, palette: false })).toBe('CLOSE_MENU')
      expect(escapeStep({ ...all, palette: false, menu: false })).toBe('CLOSE_DETAILS')
      expect(escapeStep({ ...all, palette: false, menu: false, details: false })).toBe('LEAVE_COMPOSER')
      expect(escapeStep({ ...none, selection: true, thread: true })).toBe('CLEAR_SELECTION')
      expect(escapeStep({ ...none, thread: true })).toBe('BACK')
   })

   it('should do nothing when there is nothing to close', () => {
      expect(escapeStep(none)).toBeUndefined()
   })
})
