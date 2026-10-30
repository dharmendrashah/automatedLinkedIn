import { describe, expect, it } from 'vitest'

import { TypingBuffer, clickFraction, keyInput } from './takeover-input'

describe('clickFraction', () => {
   const rect = {
      left: 100,
      top: 50,
      width: 400,
      height: 200,
   }

   it('should say where a click was as a fraction of the picture, whatever size it is shown at', () => {
      expect(clickFraction({ clientX: 300, clientY: 150 }, rect)).toEqual({ x: 0.5, y: 0.5 })
      expect(clickFraction({ clientX: 100, clientY: 50 }, rect)).toEqual({ x: 0, y: 0 })
   })

   it('should keep a click that landed on the border inside the page', () => {
      expect(clickFraction({ clientX: 99, clientY: 251 }, rect)).toEqual({ x: 0, y: 1 })
   })

   it('should have no answer for a picture that has no size yet', () => {
      expect(clickFraction({ clientX: 1, clientY: 1 }, { ...rect, width: 0 })).toBeUndefined()
   })
})

describe('keyInput', () => {
   const press = (key: string, extra: Record<string, boolean> = {}) =>
      keyInput({
         key,
         ctrlKey: false,
         metaKey: false,
         altKey: false,
         ...extra,
      })

   it('should type a printable character, capitals and symbols included', () => {
      expect(press('a')).toEqual({ kind: 'type', text: 'a' })
      expect(press('A')).toEqual({ kind: 'type', text: 'A' })
      expect(press('@')).toEqual({ kind: 'type', text: '@' })
      expect(press(' ')).toEqual({ kind: 'type', text: ' ' })
   })

   it('should press the keys a form needs', () => {
      for (const key of [
         'Enter',
         'Tab',
         'Backspace',
         'Delete',
         'Escape',
         'ArrowUp',
         'ArrowDown',
         'ArrowLeft',
         'ArrowRight',
      ]) {
         expect(press(key)).toEqual({ kind: 'key', key })
      }
   })

   it('should leave shortcuts of the owner own browser alone', () => {
      expect(press('r', { metaKey: true })).toBeUndefined()
      expect(press('c', { ctrlKey: true })).toBeUndefined()
      expect(press('F5')).toBeUndefined()
      expect(press('Shift')).toBeUndefined()
   })
})

describe('TypingBuffer', () => {
   it('should join what is typed into one input, so a fast typist is one request and not one for each key', () => {
      const buffer = new TypingBuffer()

      buffer.add('1')
      buffer.add('2')
      buffer.add('3')

      expect(buffer.take()).toEqual({ kind: 'type', text: '123' })
      expect(buffer.take()).toBeUndefined()
   })

   it('should never hold more than the contract allows in one input', () => {
      const buffer = new TypingBuffer()

      buffer.add('x'.repeat(250))

      expect(buffer.take()).toEqual({ kind: 'type', text: 'x'.repeat(200) })
      expect(buffer.take()).toEqual({ kind: 'type', text: 'x'.repeat(50) })
   })
})
