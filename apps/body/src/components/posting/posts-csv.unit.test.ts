import { describe, expect, it } from 'vitest'

import { cell, postsCsv } from './posts-csv'

describe('cell', () => {
   it('should quote a cell with a comma, a quote or a line break, and double the quotes', () => {
      expect(cell('plain')).toBe('plain')
      expect(cell('a, b')).toBe('"a, b"')
      expect(cell('say "hi"')).toBe('"say ""hi"""')
      expect(cell('one\ntwo')).toBe('"one\ntwo"')
   })

   it('should keep a cell that starts like a formula as text', () => {
      expect(cell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
      expect(cell('+1 call')).toBe("'+1 call")
      expect(cell('-5%')).toBe("'-5%")
      expect(cell('@sum')).toBe("'@sum")
   })
})

describe('postsCsv', () => {
   const post = {
      state: 'POSTED' as const,
      words: 'Hello,\n  world',
      link: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
      scheduledAt: null,
      postedAt: '2026-10-27T09:00:00.000Z',
      createdAt: '2026-10-26T09:00:00.000Z',
   }

   it('should write a header and one line per post, with the date it went, else its plan, else when it was sent', () => {
      const lines = postsCsv([
         { post, client: 'Acme', account: 'Ada' },
         {
            post: { ...post, state: 'SCHEDULED', link: null, postedAt: null, scheduledAt: '2026-11-01T08:00:00.000Z' },
            client: '',
            account: 'Bob',
         },
         {
            post: { ...post, state: 'FAILED', link: null, postedAt: null },
            client: '',
            account: 'Bob',
         },
      ]).split('\r\n')

      expect(lines[0]).toBe('Client,Account,State,Date,Link,Words')
      expect(lines[1]).toBe(
         'Acme,Ada,Posted,2026-10-27T09:00:00.000Z,https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/,"Hello, world"'
      )
      expect(lines[2]).toBe(',Bob,Planned,2026-11-01T08:00:00.000Z,,"Hello, world"')
      expect(lines[3]).toBe(',Bob,Not posted,2026-10-26T09:00:00.000Z,,"Hello, world"')
   })
})
