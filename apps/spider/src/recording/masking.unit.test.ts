import { describe, expect, it } from 'vitest'

import { maskHeaders, maskText, maskUrl } from './masking'

describe('maskHeaders', () => {
   it('should hide the values of cookies, authorization and tokens but keep what was there', () => {
      expect(
         maskHeaders({
            'Content-Type': 'text/html',
            Cookie: 'li_at=SECRETTOKEN; JSESSIONID="ajax:123"',
            'set-cookie': 'li_at=NEWSECRET; Path=/; Secure',
            Authorization: 'Bearer abc.def',
            'proxy-authorization': 'Basic dXNlcjpwYXNz',
            'csrf-token': 'ajax:123',
            Accept: '*/*',
         })
      ).toEqual({
         'Content-Type': 'text/html',
         Cookie: 'li_at=***; JSESSIONID=***',
         'set-cookie': 'li_at=***',
         Authorization: 'Bearer ***',
         'proxy-authorization': 'Basic ***',
         'csrf-token': '***',
         Accept: '*/*',
      })
   })

   it('should mask a header with several set-cookie lines', () => {
      expect(maskHeaders({ 'set-cookie': 'a=1; Path=/\nb=2; Path=/' })).toEqual({ 'set-cookie': 'a=***\nb=***' })
   })

   it('should not let a secret through when the header is not plain text', () => {
      expect(JSON.stringify(maskHeaders({ cookie: 'x' }))).not.toContain('"x"')
   })
})

describe('maskUrl', () => {
   it('should keep the address and mask the values of sensitive query parameters', () => {
      expect(maskUrl('https://www.linkedin.com/checkpoint/challenge?token=ABC&step=2&pin=123456&Session_Key=k')).toBe(
         'https://www.linkedin.com/checkpoint/challenge?token=***&step=2&pin=***&Session_Key=***'
      )
   })

   it('should drop credentials in the address', () => {
      expect(maskUrl('http://user:pass@proxy.example.net:8080/x')).toBe('http://***@proxy.example.net:8080/x')
   })

   it('should leave a plain address as it was', () => {
      expect(maskUrl('https://www.linkedin.com/feed/')).toBe('https://www.linkedin.com/feed/')
   })

   it('should mask a value that is not an address at all', () => {
      expect(maskUrl('not a url?token=abc')).toBe('not a url?token=***')
   })
})

describe('maskText', () => {
   it('should hide credentials in addresses, tokens and sensitive parameters', () => {
      expect(maskText('Proxy socks5://bob:hunter2@10.0.0.1:1080 failed; Bearer abc.def; password=letmein&x=1')).toBe(
         'Proxy socks5://***@10.0.0.1:1080 failed; Bearer ***; password=***&x=1'
      )
   })

   it('should cut a long message', () => {
      expect(maskText('a'.repeat(3000))).toHaveLength(2001)
      expect(maskText('a'.repeat(3000)).endsWith('…')).toBe(true)
   })
})
