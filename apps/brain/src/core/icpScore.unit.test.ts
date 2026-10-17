import { describe, expect, it } from 'vitest'

import { type IcpRules, scoreIcp } from './icpScore'

const rules: IcpRules = {
   includeTitles: ['growth', 'head of sales'],
   excludeTitles: ['intern'],
   seniorities: ['VP', 'HEAD'],
   locations: ['london'],
}

describe('scoreIcp', () => {
   it('should add title, seniority and location matches', () => {
      expect(
         scoreIcp(rules, {
            headline: 'Head of Sales at Acme',
            location: 'London, UK',
         })
      ).toEqual({
         score: 55,
         disqualified: false,
         matched: ['title "head of sales"', 'seniority HEAD', 'location "london"'],
      })
   })

   it('should match whole words only', () => {
      expect(
         scoreIcp(rules, {
            headline: 'Growthhacker',
            location: null,
         }).score
      ).toBe(0)
   })

   it('should disqualify on an excluded title', () => {
      expect(
         scoreIcp(rules, {
            headline: 'Growth Intern',
            location: 'London',
         })
      ).toEqual({
         score: 0,
         disqualified: true,
         matched: ['excluded title "intern"'],
      })
   })

   it('should score nothing for an empty sample or empty rules', () => {
      expect(
         scoreIcp(rules, {
            headline: null,
            location: null,
         }).score
      ).toBe(0)
      expect(
         scoreIcp(
            {
               includeTitles: [],
               excludeTitles: [],
               seniorities: [],
               locations: [],
            },
            {
               headline: 'VP Growth',
               location: 'London',
            }
         ).score
      ).toBe(0)
   })

   it('should treat regex characters in a rule as plain text', () => {
      expect(
         scoreIcp(
            {
               ...rules,
               includeTitles: ['c++ (lead)'],
            },
            {
               headline: 'C++ (Lead) engineer',
               location: null,
            }
         ).score
      ).toBe(30)
   })
})
