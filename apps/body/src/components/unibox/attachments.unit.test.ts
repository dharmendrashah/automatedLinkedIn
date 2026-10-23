import { describe, expect, it } from 'vitest'

import { LIMITS, checkAttachment, formatBytes, kindOfFile } from './attachments'

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

describe('checkAttachment', () => {
   it('should accept a file within the limit of its kind', () => {
      expect(checkAttachment('IMAGE', 2 * MB, 0)).toEqual({ ok: true })
   })

   it('should say plainly why a file is refused: too large, empty, or too many', () => {
      expect(checkAttachment('IMAGE', LIMITS.IMAGE + 1, 0)).toEqual({
         ok: false,
         reason: `An image can be up to ${formatBytes(LIMITS.IMAGE)}.`,
      })
      expect(checkAttachment('FILE', 0, 0)).toEqual({ ok: false, reason: 'The file is empty.' })
      expect(checkAttachment('FILE', 10, LIMITS.COUNT)).toEqual({
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
