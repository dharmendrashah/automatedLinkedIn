import { describe, expect, it } from 'vitest'

import { createLinkedinViewProfile } from '.'

describe('linkedin-view-profile task', () => {
   const task = createLinkedinViewProfile({ baseUrl: 'https://www.linkedin.com' })

   it('should be called View someone’s profile, and need an account and a proxy, one at a time per account', () => {
      expect(task.name).toBe('linkedin-view-profile')
      expect(task.title).toBe('View someone’s profile')
      expect(task.needs).toEqual({
         proxy: 'required',
         account: true,
      })
      expect(task.policy.oneAtATime).toBe('account')
   })

   it('should hold the next visit of an account back for 3 minutes', () => {
      expect(task.policy.cooldownMs).toBe(3 * 60 * 1000)
   })

   it.each([
      'https://www.linkedin.com/in/ada-lovelace/',
      'https://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/in/ACoAABCdef123',
      'https://www.linkedin.com/in/%E6%97%A5%E6%9C%AC/',
   ])('should accept the address of a profile: %s', profileUrl => {
      expect(task.input.safeParse({ profileUrl }).success).toBe(true)
   })

   it.each([
      'http://www.linkedin.com/in/ada-lovelace/',
      'https://example.com/in/ada-lovelace/',
      'https://www.linkedin.com.evil.example/in/ada-lovelace/',
      'https://www.linkedin.com/company/sample/',
      'https://www.linkedin.com/in/ada-lovelace/details/skills/',
      'https://www.linkedin.com/in/ada-lovelace/?trk=x',
      'https://www.linkedin.com/in/me/',
      'https://www.linkedin.com/in/',
      'not an address',
   ])('should refuse anything else: %s', profileUrl => {
      expect(task.input.safeParse({ profileUrl }).success).toBe(false)
   })

   it('should refuse an input with more than the address and the snapshots flag', () => {
      expect(
         task.input.safeParse({
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace/',
            extra: true,
         }).success
      ).toBe(false)
   })
})
