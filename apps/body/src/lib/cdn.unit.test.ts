import { describe, expect, it } from 'vitest'

import { cdnUrlOf, mediaSource } from './cdn'

const API = 'https://api.staging.elitale.com'
const PHOTO = 'https://media.licdn.com/dms/image/v2/abc/0/1?e=1&v=beta&t=x-y'
const CACHED = `${API}/cdn?url=${encodeURIComponent(PHOTO)}`

describe('cdnUrlOf', () => {
   it('should send a third-party picture through the file cache, encoded once', () => {
      expect(cdnUrlOf(PHOTO, API)).toBe(CACHED)
   })

   it.each([
      'https://storage.googleapis.com/bucket/posts/a.jpg?X-Goog-Signature=s',
      'https://automate-linkedin-511215-cdn.storage.googleapis.com/cache/a.jpg',
      'https://api.staging.elitale.com/x.png',
      'https://localhost/x.png',
      'https://www.linkedin.com/dms/prv/image/v2/abc/messaging-image-720/0/1',
      'blob:http://localhost:3000/1b2c',
      'data:image/png;base64,AAAA',
      'http://example.com/x.png',
      'not a url',
   ])('should load %s directly', url => {
      expect(cdnUrlOf(url, API)).toBe(url)
   })
})

describe('mediaSource', () => {
   it('should try the cached copy, then the original once, then nothing', () => {
      expect([0, 1, 2].map(failures => mediaSource(PHOTO, failures, API))).toEqual([CACHED, PHOTO, undefined])
   })

   it('should try a direct address once', () => {
      const signed = 'https://storage.googleapis.com/bucket/a.jpg'

      expect([0, 1].map(failures => mediaSource(signed, failures, API))).toEqual([signed, undefined])
   })

   it.each([null, undefined, ''])('should have nothing to load for %j', url => {
      expect(mediaSource(url, 0, API)).toBeUndefined()
   })
})
