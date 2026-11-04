import { describe, expect, it } from 'vitest'

import { type IcpRules, explainMatched, scoreIcp, scorePerson } from './icpScore'

describe('explainMatched', () => {
   it('should turn each stored match into a plain reason with its points, and skip what it does not know', () => {
      expect(
         explainMatched([
            'title "growth"',
            'seniority VP',
            'location "london"',
            'comment mentions "pipeline"',
            'commented',
            'company is hiring',
            'reacted',
            'something new',
         ])
      ).toEqual([
         {
            label: 'Title matches "growth"',
            points: 30,
         },
         {
            label: 'Seniority: VP',
            points: 20,
         },
         {
            label: 'Based in "london"',
            points: 5,
         },
         {
            label: 'Commented about "pipeline"',
            points: 20,
         },
         {
            label: 'Commented on a post',
            points: 10,
         },
         {
            label: 'Their company is hiring',
            points: 10,
         },
         {
            label: 'Reacted to a post',
            points: 5,
         },
      ])
      expect(explainMatched(['excluded title "intern"'])).toEqual([
         {
            label: 'Title excluded: "intern"',
            points: 0,
         },
      ])
   })
})

const rules: IcpRules = {
   includeTitles: ['growth', 'head of sales'],
   excludeTitles: ['intern'],
   seniorities: ['VP', 'HEAD'],
   locations: ['london'],
}

describe('scorePerson', () => {
   const withProblems = {
      ...rules,
      problemKeywords: ['pipeline'],
   }

   it('should add engagement to the headline score, problem comments first, and cap at 100', () => {
      expect(
         scorePerson(withProblems, {
            headline: 'Growth lead',
            location: null,
            signals: [
               {
                  type: 'commented',
                  excerpt: 'Our Pipeline is empty',
               },
               {
                  type: 'reacted',
                  excerpt: null,
               },
            ],
         })
      ).toEqual({
         score: 55,
         disqualified: false,
         matched: ['title "growth"', 'comment mentions "pipeline"', 'reacted'],
      })
      expect(
         scorePerson(withProblems, {
            headline: 'Head of Sales, growth',
            location: 'London',
            signals: Array.from({ length: 4 }, () => ({
               type: 'commented' as const,
               excerpt: 'pipeline',
            })),
         }).score
      ).toBe(100)
   })

   it('should keep an excluded title at 0 whatever the engagement', () => {
      expect(
         scorePerson(withProblems, {
            headline: 'Sales intern',
            location: null,
            signals: [
               {
                  type: 'commented',
                  excerpt: 'pipeline',
               },
            ],
         }).score
      ).toBe(0)
   })
})

describe('scoring by the company of the current job', () => {
   const company: IcpRules = {
      ...rules,
      industries: ['Software', 'Fintech'],
      companySizes: ['51 - 200', '201-500'],
   }
   const read = {
      headline: 'Head of Sales at Acme',
      location: 'London, UK',
      read: true,
   }

   it('should add 15 for the industry and 15 for the size band, both written as plain reasons', () => {
      const result = scoreIcp(company, {
         ...read,
         companyIndustry: 'Software Development',
         companySize: '51-200',
      })

      expect(result).toEqual({
         score: 85,
         disqualified: false,
         matched: [
            'title "head of sales"',
            'seniority HEAD',
            'location "london"',
            'industry "Software"',
            'company size 51 to 200',
         ],
      })
      expect(explainMatched(result.matched).slice(-2)).toEqual([
         {
            label: 'Industry: Software',
            points: 15,
         },
         {
            label: 'Company size 51 to 200',
            points: 15,
         },
      ])
   })

   it('should match a size band written with a dash of another kind, and not a size that is outside the bands', () => {
      expect(
         scoreIcp(company, {
            ...read,
            companySize: '201\u2013500',
         }).matched
      ).toContain('company size 201 to 500')
      expect(
         scoreIcp(company, {
            ...read,
            companySize: '11-50',
         }).matched
      ).toEqual(['title "head of sales"', 'seniority HEAD', 'location "london"'])
   })

   it('should say the profile was not read yet, with no points, when the ideal customer cares about the company', () => {
      const unread = scoreIcp(company, {
         headline: 'Head of Sales at Acme',
         location: null,
         read: false,
      })

      expect(unread.score).toBe(50)
      expect(unread.matched.at(-1)).toBe('profile not read yet')
      expect(explainMatched(unread.matched).at(-1)).toEqual({
         label: 'Profile not read yet',
         points: 0,
      })
   })

   it('should not change a score when the ideal customer has no industry or size, read or not', () => {
      const plain = scoreIcp(rules, {
         headline: 'Head of Sales at Acme',
         location: 'London',
      })

      expect(
         scoreIcp(rules, {
            ...read,
            companyIndustry: 'Software',
            companySize: '51-200',
         })
      ).toEqual(plain)
      expect(
         scoreIcp(rules, {
            ...read,
            read: false,
         })
      ).toEqual(plain)
   })
})

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
