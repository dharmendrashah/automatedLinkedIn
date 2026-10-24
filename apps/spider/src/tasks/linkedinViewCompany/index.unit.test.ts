import { describe, expect, it } from 'vitest'

import { createLinkedinViewCompany } from '.'
import { answerFor } from './answer'

describe('linkedin-view-company task', () => {
   const task = createLinkedinViewCompany({ baseUrl: 'https://www.linkedin.com' })

   it('should be called View a company, and need an account and a proxy, one at a time per account', () => {
      expect(task.name).toBe('linkedin-view-company')
      expect(task.title).toBe('View a company')
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
      'https://www.linkedin.com/company/analytical-engines/',
      'https://www.linkedin.com/company/analytical-engines',
      'https://www.linkedin.com/company/1234567/',
   ])('should accept the address of a company page: %s', companyUrl => {
      expect(task.input.safeParse({ companyUrl }).success).toBe(true)
   })

   it.each([
      'http://www.linkedin.com/company/analytical-engines/',
      'https://example.com/company/analytical-engines/',
      'https://www.linkedin.com.evil.example/company/analytical-engines/',
      'https://www.linkedin.com/in/ada-lovelace/',
      'https://www.linkedin.com/company/analytical-engines/about/',
      'https://www.linkedin.com/company/analytical-engines/?trk=x',
      'https://www.linkedin.com/company/',
      'not an address',
   ])('should refuse anything else: %s', companyUrl => {
      expect(task.input.safeParse({ companyUrl }).success).toBe(false)
   })

   it('should refuse an input with more than the address and the snapshots flag', () => {
      expect(
         task.input.safeParse({
            companyUrl: 'https://www.linkedin.com/company/analytical-engines/',
            extra: true,
         }).success
      ).toBe(false)
   })
})

describe('answerFor', () => {
   it('should say a viewed company page succeeded, with fixed sentences', () => {
      expect(answerFor('DONE')).toEqual({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Viewed the company page.',
         commitSession: true,
      })
      expect(answerFor('NOT_AVAILABLE')).toEqual({
         status: 'FAILED',
         verdict: 'NOT_AVAILABLE',
         message: 'The page was not a company page that could be viewed.',
      })
      expect(answerFor('SIGNED_OUT')).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
   })
})
