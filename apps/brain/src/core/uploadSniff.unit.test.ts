import { describe, expect, it } from 'vitest'

import { looksLike } from './uploadSniff'

const bytes = (...values: number[]) => Buffer.from(values)
const text = (value: string) => Buffer.from(value, 'latin1')

describe('looksLike', () => {
   it('should accept the first bytes each type starts with', () => {
      expect(looksLike('a.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))).toBe(true)
      expect(looksLike('a.JPG', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
      expect(looksLike('a.gif', text('GIF89a'))).toBe(true)
      expect(looksLike('a.webp', Buffer.concat([text('RIFF'), bytes(1, 2, 3, 4), text('WEBP')]))).toBe(true)
      expect(looksLike('a.pdf', text('%PDF-1.7'))).toBe(true)
      expect(looksLike('a.ai', text('%!PS-Adobe'))).toBe(true)
      expect(looksLike('a.psd', text('8BPS'))).toBe(true)
      expect(looksLike('a.docx', bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true)
      expect(looksLike('a.doc', bytes(0xd0, 0xcf, 0x11, 0xe0))).toBe(true)
      expect(looksLike('a.mp4', Buffer.concat([bytes(0, 0, 0, 0x18), text('ftypmp42')]))).toBe(true)
      expect(looksLike('a.mov', Buffer.concat([bytes(0, 0, 0, 8), text('wide')]))).toBe(true)
      expect(looksLike('a.mp3', text('ID3'))).toBe(true)
      expect(looksLike('a.mp3', bytes(0xff, 0xfb, 0x90))).toBe(true)
      expect(looksLike('a.wav', Buffer.concat([text('RIFF'), bytes(1, 2, 3, 4), text('WAVE')]))).toBe(true)
      expect(looksLike('a.txt', text('hello there'))).toBe(true)
      expect(looksLike('a.eml', text('From: ada@example.com'))).toBe(true)
      expect(looksLike('a.m4a', Buffer.concat([bytes(0, 0, 0, 0x20), text('ftypM4A ')]))).toBe(true)
   })

   it('should refuse a file whose first bytes are another type, such as a program renamed to .pdf', () => {
      expect(looksLike('a.pdf', bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(false)
      expect(looksLike('a.png', text('<script>alert(1)</script>'))).toBe(false)
      expect(looksLike('a.mp4', text('not a movie at all'))).toBe(false)
      expect(looksLike('a.txt', bytes(0x68, 0x00, 0x69))).toBe(false)
   })

   it('should refuse an empty file, a type that is not accepted and a name with no extension', () => {
      expect(looksLike('a.pdf', Buffer.alloc(0))).toBe(false)
      expect(looksLike('a.zip', bytes(0x50, 0x4b, 0x03, 0x04))).toBe(false)
      expect(looksLike('noextension', text('hello'))).toBe(false)
   })
})
