import { describe, expect, it } from 'vitest'

import { MAX_PROFILE_URLS, TooManyProfileUrlsError, parseProfileUrl, parseProfileUrls } from './profileUrl'

const ada = {
   slug: 'ada-lovelace',
   url: 'https://www.linkedin.com/in/ada-lovelace',
}

describe('parseProfileUrl', () => {
   it.each([
      'https://www.linkedin.com/in/ada-lovelace',
      'http://linkedin.com/in/Ada-Lovelace/',
      'linkedin.com/in/ada-lovelace?utm_source=share&trk=abc',
      'https://uk.linkedin.com/in/ada-lovelace/details/experience/',
      'https://www.linkedin.com/in/ada-lovelace/#about',
   ])('should reduce %s to the canonical profile', raw => {
      expect(parseProfileUrl(raw)).toEqual(ada)
   })

   it('should keep a percent-encoded unicode slug', () => {
      expect(parseProfileUrl('https://www.linkedin.com/in/jos%C3%A9-garcia')).toEqual({
         slug: 'josé-garcia',
         url: 'https://www.linkedin.com/in/jos%C3%A9-garcia',
      })
   })

   it.each([
      'https://www.linkedin.com/company/elitale',
      'https://www.linkedin.com/sales/lead/abc',
      'https://www.linkedin.com/in/',
      'https://www.linkedin.com/in/a',
      'https://evillinkedin.com/in/ada-lovelace',
      'https://linkedin.com.evil.com/in/ada-lovelace',
      'ftp://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/in/ada lovelace!',
      'https://www.linkedin.com/in/%E0%A4%A',
      'not a url',
   ])('should reject %s', raw => {
      expect(parseProfileUrl(raw)).toBeNull()
   })
})

describe('parseProfileUrls', () => {
   it('should split on whitespace, commas and semicolons and drop duplicates by slug', () => {
      const result = parseProfileUrls(
         'linkedin.com/in/ada-lovelace, https://www.linkedin.com/in/Ada-Lovelace/\nlinkedin.com/in/grace-hopper;'
      )

      expect(result.profiles.map(profile => profile.slug)).toEqual(['ada-lovelace', 'grace-hopper'])
      expect(result.invalid).toEqual([])
   })

   it('should report the entries that are not person profiles', () => {
      const result = parseProfileUrls('linkedin.com/in/ada-lovelace https://example.com/x https://example.com/x')

      expect(result.profiles).toEqual([ada])
      expect(result.invalid).toEqual(['https://example.com/x'])
   })

   it('should return nothing for an empty paste', () => {
      expect(parseProfileUrls('  ,\n ')).toEqual({
         profiles: [],
         invalid: [],
      })
   })

   it('should cut a very long invalid entry', () => {
      const [entry] = parseProfileUrls('x'.repeat(5000)).invalid

      expect(entry).toHaveLength(200)
   })

   it('should refuse more entries than the limit', () => {
      const paste = Array.from({ length: MAX_PROFILE_URLS + 1 }, (_, index) => `linkedin.com/in/person-${index}`).join(
         '\n'
      )

      expect(() => parseProfileUrls(paste)).toThrow(TooManyProfileUrlsError)
   })
})
