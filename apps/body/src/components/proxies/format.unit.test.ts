import { describe, expect, it } from 'vitest'

import { formatBody, formatHeaders } from './format'

describe('formatHeaders', () => {
   it('should write one header per line as name: value', () => {
      expect(formatHeaders({ host: 'api.ipinfo.io', authorization: 'Bearer ***' })).toBe(
         'host: api.ipinfo.io\nauthorization: Bearer ***'
      )
   })

   it.each([null, undefined, [], 'text', 4])('should say there are none for %j', value => {
      expect(formatHeaders(value)).toBe('(none)')
   })

   it('should ignore a value that is not text, which a proxy could send back', () => {
      expect(formatHeaders({ a: 'ok', b: { nested: true }, c: 3 })).toBe('a: ok')
   })
})

describe('formatBody', () => {
   it('should show JSON indented, so it can be read', () => {
      expect(formatBody('{"ip":"1.2.3.4","country":"Canada"}', false)).toBe(
         '{\n  "ip": "1.2.3.4",\n  "country": "Canada"\n}'
      )
   })

   it('should show anything else exactly as received', () => {
      expect(formatBody('<html><script>alert(1)</script></html>', false)).toBe('<html><script>alert(1)</script></html>')
   })

   it('should say when there is no body', () => {
      expect(formatBody(null, false)).toBe('(empty)')
      expect(formatBody('', false)).toBe('(empty)')
   })

   it('should say when the body was cut, and not try to indent half a document', () => {
      expect(formatBody('{"ip":"1.2', true)).toBe('{"ip":"1.2\n\n(cut after 64 KB)')
   })
})
