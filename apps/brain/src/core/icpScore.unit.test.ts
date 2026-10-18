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
