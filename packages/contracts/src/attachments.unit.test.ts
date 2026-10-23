import { describe, expect, it } from 'vitest'

import {
   ATTACHMENT_EXTENSIONS,
   MAX_ATTACHMENT_BYTES,
   UPLOAD_ID,
   extensionOf,
   keptPrefix,
   kindOfName,
   receivedKey,
   replyFileSchema,
   safeFileName,
   sentKey,
} from './attachments'

describe('attachments', () => {
   it('should allow files up to 20 MB', () => {
      expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024)
   })

   it('should say the kind of a file by its name, whatever the case, and nothing for a type that may not be sent', () => {
      expect(kindOfName('Photo.JPG')).toBe('IMAGE')
      expect(kindOfName('clip.mp4')).toBe('VIDEO')
      expect(kindOfName('note.m4a')).toBe('AUDIO')
      expect(kindOfName('Report.PDF')).toBe('FILE')
      expect(kindOfName('archive.zip')).toBeUndefined()
      expect(kindOfName('setup.exe')).toBeUndefined()
      expect(kindOfName('noextension')).toBeUndefined()
      expect(ATTACHMENT_EXTENSIONS).toContain('docx')
   })

   it('should keep only the extension after the last dot', () => {
      expect(extensionOf('a.tar.PDF')).toBe('pdf')
      expect(extensionOf('a.')).toBeUndefined()
   })

   it('should make a name safe: no folders, no control characters, no leading dot, and a bounded length that keeps the extension', () => {
      expect(safeFileName('../../etc/passwd.txt')).toBe('passwd.txt')
      expect(safeFileName('C:\\Users\\me\\cv.pdf')).toBe('cv.pdf')
      expect(safeFileName('..hidden.png')).toBe('hidden.png')
      expect(safeFileName('a\u0000b<c>.pdf')).toBe('abc.pdf')

      const long = safeFileName(`${'x'.repeat(300)}.pdf`)

      expect(long).toHaveLength(120)
      expect(long.endsWith('.pdf')).toBe(true)
   })

   it('should keep files for good under one folder per owner and account, so removing an account can remove them', () => {
      const upload = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

      expect(keptPrefix('u1', 'a1')).toBe('kept/u1/a1/')
      expect(sentKey('u1', 'a1', upload, 'cv.pdf')).toBe(`kept/u1/a1/sent/${upload}/cv.pdf`)
   })

   it('should name a received file by its message and place, the same on every read, whatever the message id holds', () => {
      const key = receivedKey('u1', 'a1', 'urn:li:msg_message:(urn:li:fsd_profile:X,2-abc==)', 0, '../plan.png')

      expect(key).toMatch(/^kept\/u1\/a1\/received\/[0-9a-f]{32}\/0-plan\.png$/)
      expect(receivedKey('u1', 'a1', 'urn:li:msg_message:(urn:li:fsd_profile:X,2-abc==)', 0, '../plan.png')).toBe(key)
      expect(receivedKey('u1', 'a1', 'other', 0, 'plan.png')).not.toBe(key)
      expect(receivedKey('u1', 'a1', 'm', 1, '')).toMatch(/\/1-file$/)
   })

   it('should recognise an upload id and a reply file', () => {
      expect(UPLOAD_ID.test('0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34')).toBe(true)
      expect(UPLOAD_ID.test('../x')).toBe(false)
      expect(
         replyFileSchema.safeParse({
            name: 'a.pdf',
            kind: 'FILE',
         }).success
      ).toBe(true)
      expect(
         replyFileSchema.safeParse({
            name: 'a.pdf',
            kind: 'LINK',
         }).success
      ).toBe(false)
      expect(
         replyFileSchema.safeParse({
            name: 'a.pdf',
            kind: 'FILE',
            extra: 1,
         }).success
      ).toBe(false)
   })
})
