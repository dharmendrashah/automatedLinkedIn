import { describe, expect, it } from 'vitest'

import { extensionFor, mediaType, objectKey, parseRemoteUrl, publicUrlOf, servedAs, sizeCap, urlHash } from './cdnUrl'

describe('parseRemoteUrl', () => {
   it('should normalise the host, the default port and the fragment, and keep the query', () => {
      expect(parseRemoteUrl('https://MEDIA.LICDN.COM.:443/a/b.jpg?e=1&t=x#top')?.href).toBe(
         'https://media.licdn.com/a/b.jpg?e=1&t=x'
      )
   })

   it.each([
      undefined,
      '',
      ['https://a.com/x'],
      'not a url',
      'http://a.com/x',
      'ftp://a.com/x',
      'data:text/plain,hi',
      'javascript:alert(1)',
      'https://user:pass@a.com/x',
      'https://a.com:8443/x',
      'https://127.0.0.1/x',
      'https://[::1]/x',
      'https://0x7f000001/x',
      'https://localhost/x',
      'https://intranet/x',
      `https://a.com/${'x'.repeat(2048)}`,
   ])('should refuse %j', raw => {
      expect(parseRemoteUrl(raw)).toBeNull()
   })
})

describe('urlHash', () => {
   it('should be the MD5 of the normalised address', () => {
      const url = parseRemoteUrl('https://A.com/x#y')

      expect(url && urlHash(url)).toBe('1c629182247750d8f4da5543e94dd8f8')
   })
})

describe('mediaType', () => {
   it('should keep the bare type in lowercase', () => {
      expect(mediaType('Image/JPEG; charset=binary')).toBe('image/jpeg')
   })

   it.each([undefined, '', 'nonsense', 'a/b/c'])('should be empty for %j', header => {
      expect(mediaType(header)).toBe('')
   })
})

describe('servedAs', () => {
   it.each(['image/png', 'video/mp4', 'audio/mpeg', 'application/pdf'])('should serve %s as itself', type => {
      expect(servedAs(type)).toEqual({ contentType: type })
   })

   it.each(['image/svg+xml', 'text/html', 'application/javascript', ''])('should serve %j as a download', type => {
      expect(servedAs(type)).toEqual({
         contentType: 'application/octet-stream',
         contentDisposition: 'attachment',
      })
   })
})

describe('sizeCap', () => {
   it('should allow 200 MB of video and audio and 25 MB of anything else', () => {
      expect(sizeCap('video/mp4')).toBe(200 * 1024 * 1024)
      expect(sizeCap('image/png')).toBe(25 * 1024 * 1024)
   })
})

describe('extensionFor', () => {
   const url = new URL('https://a.com/dir/photo.PNG')

   it('should take the extension of the answer type first', () => {
      expect(extensionFor(url, 'image/jpeg')).toBe('jpg')
   })

   it('should fall back to the path, then to bin', () => {
      expect(extensionFor(url, 'image/x-unknown')).toBe('png')
      expect(extensionFor(new URL('https://media.licdn.com/dms/image/v2/abc/0/1?e=1'), '')).toBe('bin')
   })
})

describe('objectKey', () => {
   it('should place the file by host, extension and UTC day', () => {
      const url = new URL('https://media.licdn.com/dms/image/v2/abc?e=1')

      expect(objectKey(url, 'image/jpeg', 'h', new Date('2026-01-05T23:30:00Z'))).toBe(
         'cache/media.licdn.com/jpg/2026/01/05/h.jpg'
      )
   })
})

describe('publicUrlOf', () => {
   it('should turn the bucket address into its public address', () => {
      expect(publicUrlOf('gs://b/cache/x.jpg')).toBe('https://storage.googleapis.com/b/cache/x.jpg')
   })
})
