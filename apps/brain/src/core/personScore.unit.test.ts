import { describe, expect, it } from 'vitest'

import { personIcpScore } from './personScore'

const rules = {
   includeTitles: ['founder'],
   excludeTitles: ['intern'],
   seniorities: [],
   locations: [],
   industries: ['software'],
   companySizes: ['11-50'],
   problemKeywords: ['outbound'],
}

const facts = {
   headline: 'Founder at Acme',
   title: null,
   location: null,
   companyIndustry: null,
   companySize: null,
   read: false,
   signals: [],
}

describe('personIcpScore', () => {
   it('should score a title that the ideal customer includes', () => {
      const result = personIcpScore(rules, facts)

      expect(result.disqualified).toBe(false)
      expect(result.score).toBeGreaterThan(0)
   })

   it('should disqualify a title the ideal customer excludes', () => {
      expect(
         personIcpScore(rules, {
            ...facts,
            headline: 'Intern at Acme',
         }).disqualified
      ).toBe(true)
   })

   it('should count the company industry only once the profile was read', () => {
      const withIndustry = {
         ...facts,
         companyIndustry: 'Software Development',
      }

      expect(
         personIcpScore(rules, {
            ...withIndustry,
            read: true,
         }).score
      ).toBeGreaterThan(
         personIcpScore(rules, {
            ...withIndustry,
            read: false,
         }).score
      )
   })

   it('should add the points of an engagement signal that names a problem keyword', () => {
      const commented = {
         type: 'commented',
         excerpt: 'We need better outbound replies',
      }

      expect(
         personIcpScore(rules, {
            ...facts,
            signals: [commented],
         }).score
      ).toBeGreaterThan(personIcpScore(rules, facts).score)
   })

   it('should ignore a signal type the score does not use', () => {
      expect(
         personIcpScore(rules, {
            ...facts,
            signals: [
               {
                  type: 'viewed',
                  excerpt: null,
               },
            ],
         }).score
      ).toBe(personIcpScore(rules, facts).score)
   })
})
