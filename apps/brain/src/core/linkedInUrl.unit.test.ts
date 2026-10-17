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

const POST_ID = '7123456789012345678'

const activity = {
   slug: `activity-${POST_ID}`,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}`,
}

describe('parseLinkedInUrl for a post', () => {
   it.each([
      `https://www.linkedin.com/posts/ada-lovelace_engines-are-fun-activity-${POST_ID}-AbCd`,
      `https://www.linkedin.com/posts/ada-lovelace_engines-are-fun-activity-${POST_ID}-AbCd/?utm_source=share&rcm=x`,
      `linkedin.com/posts/ada-lovelace_activity-${POST_ID}`,
      `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}`,
      `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}/?trk=x`,
      `https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A${POST_ID}`,
      `https://uk.linkedin.com/feed/update/URN:LI:ACTIVITY:${POST_ID}`,
   ])('should reduce %s to the canonical post', raw => {
      expect(parseLinkedInUrl(raw, 'post')).toEqual(activity)
   })

   it('should keep the share and ugcPost types in the slug and the link', () => {
      expect(parseLinkedInUrl(`linkedin.com/posts/ada_x-share-${POST_ID}-Zz9`, 'post')).toEqual({
         slug: `share-${POST_ID}`,
         url: `https://www.linkedin.com/feed/update/urn:li:share:${POST_ID}`,
      })
      expect(parseLinkedInUrl(`linkedin.com/feed/update/urn:li:ugcPost:${POST_ID}`, 'post')).toEqual({
         slug: `ugcpost-${POST_ID}`,
         url: `https://www.linkedin.com/feed/update/urn:li:ugcPost:${POST_ID}`,
      })
   })

   it.each([
      'https://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/company/elitale',
      'https://www.linkedin.com/feed/',
      'https://www.linkedin.com/feed/update/urn:li:activity:123',
      'https://www.linkedin.com/feed/update/urn:li:activity:abc',
      'https://www.linkedin.com/feed/update/urn:li:comment:7123456789012345678',
      `https://www.linkedin.com/posts/ada-lovelace_engines-${POST_ID}`,
      `https://www.linkedin.com/pulse/activity-${POST_ID}`,
      `https://example.com/feed/update/urn:li:activity:${POST_ID}`,
      `https://linkedin.com.evil.com/feed/update/urn:li:activity:${POST_ID}`,
      `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}9999999999`,
      'not a url',
   ])('should reject %s', raw => {
      expect(parseLinkedInUrl(raw, 'post')).toBeNull()
   })

   it('should keep a lnkd.in short link as it is, with its case', () => {
      const short = {
         slug: 'lnkd-gSSgfQQj',
         url: 'https://lnkd.in/p/gSSgfQQj',
      }

      expect(parseLinkedInUrl('https://lnkd.in/p/gSSgfQQj', 'post')).toEqual(short)
      expect(parseLinkedInUrl('lnkd.in/p/gSSgfQQj/?utm_source=share', 'post')).toEqual(short)
      expect(parseLinkedInUrl('lnkd.in/p/gssgfqqj', 'post')?.slug).toBe('lnkd-gssgfqqj')
   })

   it.each([
      'https://lnkd.in/p/',
      'https://lnkd.in/p/a',
      'https://lnkd.in/gSSgfQQj',
      'https://lnkd.in/p/gSSg fQQj!',
      'https://evil-lnkd.in/p/gSSgfQQj',
      'https://lnkd.in.evil.com/p/gSSgfQQj',
   ])('should reject the short link %s', raw => {
      expect(parseLinkedInUrl(raw, 'post')).toBeNull()
   })

   it('should not accept a lnkd.in link as a profile or a company', () => {
      expect(parseLinkedInUrl('https://lnkd.in/p/gSSgfQQj', 'profile')).toBeNull()
      expect(parseLinkedInUrl('https://lnkd.in/p/gSSgfQQj', 'company')).toBeNull()
   })

   it('should not read a post link as a profile or a company', () => {
      const raw = `https://www.linkedin.com/posts/ada-lovelace_x-activity-${POST_ID}-AbCd`

      expect(parseLinkedInUrl(raw, 'profile')).toBeNull()
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
