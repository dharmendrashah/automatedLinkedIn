import { describe, expect, it } from 'vitest'

import { digestText, redactContacts } from './redact'

describe('redactContacts', () => {
   it('should remove emails and phone numbers and leave the rest', () => {
      expect(redactContacts('Mail ada@engines.example or call +44 20 7946 0958 today')).toBe(
         'Mail [email removed] or call [phone removed] today'
      )
      expect(redactContacts('Call (415) 555-0132.')).toBe('Call [phone removed].')
   })

   it('should leave short numbers, years and prices alone', () => {
      expect(redactContacts('In 2026 we grew 40% to $1,200 a month, 12 people')).toBe(
         'In 2026 we grew 40% to $1,200 a month, 12 people'
      )
   })
})

describe('digestText', () => {
   it('should collapse spaces, cut to the limit and redact when asked', () => {
      expect(digestText('a   b\n c', true)).toBe('a b c')
      expect(digestText('x'.repeat(300), true)).toHaveLength(200)
      expect(digestText('ada@engines.example', true)).toBe('[email removed]')
      expect(digestText('ada@engines.example', false)).toBe('ada@engines.example')
   })
})
