import { describe, expect, it } from 'vitest'

import { TaskError } from './errors'
import { HostPolicy } from './policy'

describe('HostPolicy', () => {
   const policy = HostPolicy.fromList(' Example.com , localhost ,,')

   it('should require at least one allowed host', () => {
      expect(() => HostPolicy.fromList('')).toThrow(/at least one/)
      expect(() => HostPolicy.fromList(' , ')).toThrow(/at least one/)
   })

   it('should allow an exact host and its subdomains, ignoring case and port', () => {
      expect(policy.assertAllowedUrl('https://example.com/a').hostname).toBe('example.com')
      expect(policy.assertAllowedUrl('https://WWW.Example.com:8443/a').hostname).toBe('www.example.com')
      expect(policy.assertAllowedUrl('http://localhost:3000/').hostname).toBe('localhost')
   })

   it('should reject a host that is not on the list, including look-alikes', () => {
      expect(() => policy.assertAllowedUrl('https://evil.org/')).toThrow(TaskError)
      expect(() => policy.assertAllowedUrl('https://notexample.com/')).toThrow(/not allowed/)
      expect(() => policy.assertAllowedUrl('https://example.com.evil.org/')).toThrow(/not allowed/)
   })

   it('should reject non-http schemes and urls with credentials', () => {
      expect(() => policy.assertAllowedUrl('file:///etc/passwd')).toThrow(/http/)
      expect(() => policy.assertAllowedUrl('javascript:alert(1)')).toThrow()
      expect(() => policy.assertAllowedUrl('https://user:pw@example.com/')).toThrow(/credentials/)
   })

   it('should reject text that is not a url', () => {
      expect(() => policy.assertAllowedUrl('nope')).toThrow(TaskError)
   })

   it('should accept cookie domains that belong to an allowed host, with or without a leading dot', () => {
      expect(policy.allowsCookieDomain('.example.com')).toBe(true)
      expect(policy.allowsCookieDomain('www.example.com')).toBe(true)
      expect(policy.allowsCookieDomain('.evil.org')).toBe(false)
      expect(policy.allowsCookieDomain('')).toBe(false)
   })

   it('should answer yes or no without throwing', () => {
      expect(policy.allowsUrl('https://example.com/a')).toBe(true)
      expect(policy.allowsUrl('https://evil.org/')).toBe(false)
      expect(policy.allowsUrl('not a url')).toBe(false)
   })

   it('should not name the url in the error beyond its host', () => {
      expect(() => policy.assertAllowedUrl('https://evil.org/path?token=SECRET')).toThrow(/^(?!.*SECRET).*$/)
   })

   describe('robots exemption', () => {
      const exempting = HostPolicy.fromList('example.com,localhost', ' Example.com ,, ')

      it('should exempt nobody by default', () => {
         expect(policy.exemptsRobots('example.com')).toBe(false)
         expect(HostPolicy.fromList('example.com', '').exemptsRobots('example.com')).toBe(false)
      })

      it('should exempt a listed host and its subdomains, ignoring case, and nothing else', () => {
         expect(exempting.exemptsRobots('example.com')).toBe(true)
         expect(exempting.exemptsRobots('WWW.Example.com')).toBe(true)
         expect(exempting.exemptsRobots('localhost')).toBe(false)
         expect(exempting.exemptsRobots('notexample.com')).toBe(false)
         expect(exempting.exemptsRobots('example.com.evil.org')).toBe(false)
      })

      it('should refuse an exempt host that is not allowed, so a typo cannot widen the policy', () => {
         expect(() => HostPolicy.fromList('example.com', 'evil.org')).toThrow(/SPIDER_ROBOTS_EXEMPT_HOSTS/)
      })
   })
})
