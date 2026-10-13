import { describe, expect, it } from 'vitest'

import { MAX_LINKS, TooManyLinksError, parseLinkedInUrl, parseLinkedInUrls } from './linkedInUrl'

const ada = {
   slug: 'ada-lovelace',
   url: 'https://www.linkedin.com/in/ada-lovelace',
}

const elitale = {
   slug: 'elitale',
   url: 'https://www.linkedin.com/company/elitale',
}

describe('parseLinkedInUrl for a profile', () => {
   it.each([
      'https://www.linkedin.com/in/ada-lovelace',
      'http://linkedin.com/in/Ada-Lovelace/',
      'linkedin.com/in/ada-lovelace?utm_source=share&trk=abc',
      'https://uk.linkedin.com/in/ada-lovelace/details/experience/',
      'https://www.linkedin.com/in/ada-lovelace/#about',
   ])('should reduce %s to the canonical profile', raw => {
      expect(parseLinkedInUrl(raw, 'profile')).toEqual(ada)
   })

   it('should keep a percent-encoded unicode slug', () => {
      expect(parseLinkedInUrl('https://www.linkedin.com/in/jos%C3%A9-garcia', 'profile')).toEqual({
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
      expect(parseLinkedInUrl(raw, 'profile')).toBeNull()
   })
})

describe('parseLinkedInUrl for a company', () => {
   it.each([
      'https://www.linkedin.com/company/elitale',
      'linkedin.com/company/Elitale/',
      'https://www.linkedin.com/company/elitale/jobs/?trk=x',
      'https://in.linkedin.com/company/elitale/about/#top',
   ])('should reduce %s to the canonical company', raw => {
      expect(parseLinkedInUrl(raw, 'company')).toEqual(elitale)
   })

   it('should accept a short name and a numeric id', () => {
      expect(parseLinkedInUrl('linkedin.com/company/3m', 'company')?.slug).toBe('3m')
      expect(parseLinkedInUrl('linkedin.com/company/1234567', 'company')?.slug).toBe('1234567')
   })

   it.each([
      'https://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/school/mit',
      'https://www.linkedin.com/company/',
      'https://www.linkedin.com/company/a',
      'https://example.com/company/elitale',
   ])('should reject %s', raw => {
      expect(parseLinkedInUrl(raw, 'company')).toBeNull()
   })
})

describe('parseLinkedInUrls', () => {
   it('should split on whitespace, commas and semicolons and drop duplicates by slug', () => {
      const result = parseLinkedInUrls(
         'linkedin.com/in/ada-lovelace, https://www.linkedin.com/in/Ada-Lovelace/\nlinkedin.com/in/grace-hopper;',
         'profile'
      )

      expect(result.links.map(link => link.slug)).toEqual(['ada-lovelace', 'grace-hopper'])
      expect(result.invalid).toEqual([])
   })

   it('should report the entries that are not links of the asked kind', () => {
      const result = parseLinkedInUrls(
         'linkedin.com/company/elitale linkedin.com/in/ada-lovelace https://example.com/x https://example.com/x',
         'company'
      )

      expect(result.links).toEqual([elitale])
      expect(result.invalid).toEqual(['linkedin.com/in/ada-lovelace', 'https://example.com/x'])
   })

   it('should return nothing for an empty paste', () => {
      expect(parseLinkedInUrls('  ,\n ', 'profile')).toEqual({
         links: [],
         invalid: [],
      })
   })

   it('should cut a very long invalid entry', () => {
      const [entry] = parseLinkedInUrls('x'.repeat(5000), 'profile').invalid

      expect(entry).toHaveLength(200)
   })

   it('should refuse more entries than the limit', () => {
      const paste = Array.from({ length: MAX_LINKS + 1 }, (_, index) => `linkedin.com/in/person-${index}`).join('\n')

      expect(() => parseLinkedInUrls(paste, 'profile')).toThrow(TooManyLinksError)
   })
})
