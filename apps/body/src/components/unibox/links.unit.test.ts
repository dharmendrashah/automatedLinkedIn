import { describe, expect, it } from 'vitest'

import { linkify } from './links'

describe('linkify', () => {
   it('should cut a text into words and links, keeping every character', () => {
      const pieces = linkify('See https://example.com/a?b=1, please.')

      expect(pieces.map(piece => piece.text).join('')).toBe('See https://example.com/a?b=1, please.')
      expect(pieces).toEqual([
         { type: 'text', text: 'See ' },
         {
            type: 'link',
            text: 'https://example.com/a?b=1',
            href: 'https://example.com/a?b=1',
            domain: 'example.com',
            shortened: false,
         },
         { type: 'text', text: ', please.' },
      ])
   })

   it('should take www. addresses as https, and leave out the dot that ends a sentence', () => {
      const [, link] = linkify('Go to www.example.org.')

      expect(link).toMatchObject({ type: 'link', href: 'https://www.example.org/', domain: 'example.org' })
      expect(linkify('Go to www.example.org.').at(-1)).toEqual({ type: 'text', text: '.' })
   })

   it('should mark a shortened address, whose target is hidden', () => {
      expect(linkify('https://bit.ly/3abc')[0]).toMatchObject({ domain: 'bit.ly', shortened: true })
      expect(linkify('https://lnkd.in/xyz')[0]).toMatchObject({ shortened: true })
   })

   it('should only make links of http and https addresses, never script, data or file ones', () => {
      for (const text of [
         'javascript:alert(1)',
         'data:text/html,<b>x</b>',
         'file:///etc/passwd',
         'ftp://example.com/x',
         'mailto:a@b.co',
      ]) {
         expect(linkify(text).every(piece => piece.type === 'text')).toBe(true)
      }
   })

   it('should show the real host of an address with a name in front of it', () => {
      expect(linkify('http://linkedin.com@evil.example/login')[0]).toMatchObject({
         type: 'link',
         domain: 'evil.example',
      })
   })

   it('should give no link for text without one, nor for an empty text', () => {
      expect(linkify('no link here')).toEqual([{ type: 'text', text: 'no link here' }])
      expect(linkify('')).toEqual([])
   })
})
