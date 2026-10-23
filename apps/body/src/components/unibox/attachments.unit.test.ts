import { describe, expect, it } from 'vitest'

import { ACCEPT, LIMITS, checkAttachment, formatBytes, kindOfFile, sendableKind } from './attachments'

const MB = 1024 * 1024

describe('kindOfFile', () => {
   it('should tell what a file is from its type, and take anything else as a file', () => {
      expect(kindOfFile({ type: 'image/png', name: 'a.png' })).toBe('IMAGE')
      expect(kindOfFile({ type: 'video/mp4', name: 'a.mp4' })).toBe('VIDEO')
      expect(kindOfFile({ type: 'audio/webm', name: 'a.webm' })).toBe('AUDIO')
      expect(kindOfFile({ type: 'application/pdf', name: 'a.pdf' })).toBe('FILE')
      expect(kindOfFile({ type: '', name: 'archive.zip' })).toBe('FILE')
   })

   it('should not take a picture type that browsers cannot show as an image', () => {
      expect(kindOfFile({ type: 'image/svg+xml', name: 'a.svg' })).toBe('FILE')
   })
})

describe('sendableKind', () => {
   it('should say the kind of a file LinkedIn takes by its name, and nothing for another type', () => {
      expect(sendableKind('Photo.JPG')).toBe('IMAGE')
      expect(sendableKind('clip.mp4')).toBe('VIDEO')
      expect(sendableKind('note.m4a')).toBe('AUDIO')
      expect(sendableKind('Report.pdf')).toBe('FILE')
      expect(sendableKind('archive.zip')).toBeUndefined()
      expect(sendableKind('noextension')).toBeUndefined()
   })

   it('should tell a picker only the extensions of its kind', () => {
      expect(ACCEPT.IMAGE).toBe('.png,.jpg,.jpeg,.gif,.webp')
      expect(ACCEPT.VIDEO).toBe('.mp4,.mov')
      expect(ACCEPT.AUDIO).toBe('.mp3,.m4a,.wav')
      expect(ACCEPT.FILE).toContain('.pdf')
   })
})

describe('checkAttachment', () => {
   it('should accept a file of an allowed type within the limit, whatever its kind', () => {
      expect(checkAttachment('IMAGE', 2 * MB, 0, 'a.png')).toEqual({ ok: true })
      expect(checkAttachment('VIDEO', LIMITS.FILE_BYTES, 0, 'a.mp4')).toEqual({ ok: true })
      expect(checkAttachment('LINK', 10, 0)).toEqual({ ok: true })
   })

   it('should keep one limit of 20 MB for every kind', () => {
      expect(LIMITS.FILE_BYTES).toBe(20 * MB)
      expect(checkAttachment('VIDEO', LIMITS.FILE_BYTES + 1, 0, 'a.mp4')).toEqual({
         ok: false,
         reason: `A file can be up to ${formatBytes(LIMITS.FILE_BYTES)}.`,
      })
   })

   it('should say plainly why a file is refused: a type that cannot be sent, empty, or too many', () => {
      expect(checkAttachment('FILE', 10, 0, 'setup.exe')).toMatchObject({
         ok: false,
         reason: expect.stringContaining('This type of file cannot be sent'),
      })
      expect(checkAttachment('FILE', 0, 0, 'a.pdf')).toEqual({ ok: false, reason: 'The file is empty.' })
      expect(checkAttachment('FILE', 10, LIMITS.COUNT, 'a.pdf')).toEqual({
         ok: false,
         reason: `A message can carry up to ${LIMITS.COUNT} attachments.`,
      })
   })
})

describe('formatBytes', () => {
   it('should give the size in the unit people read', () => {
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(2048)).toBe('2 KB')
      expect(formatBytes(5 * MB)).toBe('5 MB')
      expect(formatBytes(1.5 * MB)).toBe('1.5 MB')
   })
})
