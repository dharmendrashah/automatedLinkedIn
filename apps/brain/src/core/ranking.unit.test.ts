import { describe, expect, it } from 'vitest'

import { type IcpRules } from './icpScore'

import { modelOf, tierLinesSchema } from '@automatedLinkedIn/contracts'

import { type RankPerson, pickBestPer, rankCompany, rankPerson, spaceOutReason } from './ranking'

const NOW = new Date('2026-11-01T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
const lines = tierLinesSchema.parse({})
const model = modelOf('balanced')

const rules: IcpRules = {
   includeTitles: ['growth'],
   excludeTitles: [],
   seniorities: ['HEAD'],
   locations: ['India'],
   industries: ['Software'],
   companySizes: ['51-200'],
}

const person = (changes: Partial<RankPerson> = {}): RankPerson => ({
   headline: 'Head of Growth',
   title: null,
   location: 'Pune, India',
   company: 'Acme',
   companyIndustry: 'Software Development',
   companySize: '51 - 200',
   followers: 1000,
   read: true,
   signals: [],
   ...changes,
})

describe('rankPerson', () => {
   it('should give a full fit, a fresh strong signal and a little reach their parts', () => {
      const ranked = rankPerson(
         person({
            signals: [
               {
                  type: 'asked',
                  at: daysAgo(0),
               },
            ],
         }),
         rules,
         model,
         lines,
         { now: NOW }
      )

      expect(ranked.parts).toEqual({
         fit: 50,
         intent: 20,
         reach: 8,
         relationship: 0,
      })
      expect(ranked.score).toBe(78)
      expect(ranked.tier).toBe('B')
      expect(ranked.matched).toContain('asked for a tool today')
   })

   it('should halve a signal after its half-life, and make slow and fast stretch and shorten it', () => {
      const signals = [
         {
            type: 'asked' as const,
            at: daysAgo(14),
         },
      ]

      expect(rankPerson(person({ signals }), rules, model, lines, { now: NOW }).parts.intent).toBe(10)
      expect(
         rankPerson(person({ signals }), rules, model, lines, {
            now: NOW,
            speed: 2,
         }).parts.intent
      ).toBe(14)
      expect(
         rankPerson(person({ signals }), rules, model, lines, {
            now: NOW,
            speed: 0.5,
         }).parts.intent
      ).toBe(5)
   })

   it('should count a type once, and cap intent at its part', () => {
      const comments = Array.from({ length: 10 }, () => ({
         type: 'commented' as const,
         at: daysAgo(0),
      }))
      const many = [
         ...comments,
         {
            type: 'asked' as const,
            at: daysAgo(0),
         },
         {
            type: 'posted' as const,
            at: daysAgo(0),
         },
      ]

      expect(rankPerson(person({ signals: comments }), rules, model, lines, { now: NOW }).parts.intent).toBe(8)
      expect(rankPerson(person({ signals: many }), rules, model, lines, { now: NOW }).parts.intent).toBe(30)
   })

   it('should ignore a signal dated in the future', () => {
      const signals = [
         {
            type: 'asked' as const,
            at: daysAgo(-3),
         },
      ]

      expect(rankPerson(person({ signals }), rules, model, lines, { now: NOW }).parts.intent).toBe(0)
   })

   it('should keep a person without a profile read below tier A, and say so', () => {
      const signals = [
         {
            type: 'asked' as const,
            at: daysAgo(0),
         },
         {
            type: 'posted' as const,
            at: daysAgo(0),
         },
      ]
      const ranked = rankPerson(
         person({
            read: false,
            signals,
            followers: 100000,
         }),
         rules,
         model,
         lines,
         { now: NOW }
      )

      expect(ranked.score).toBeLessThanOrEqual(79)
      expect(ranked.tier).toBe('B')
      expect(ranked.matched).toContain('profile not read yet, so not above tier B')
   })

   it('should exclude a competitor, a never-rank title and a never-rank company, whatever else they score', () => {
      const signals = [
         {
            type: 'asked' as const,
            at: daysAgo(0),
         },
      ]
      const never = {
         titles: ['intern'],
         companies: ['Rival Inc'],
      }

      expect(
         rankPerson(
            person({
               signals: [
                  ...signals,
                  {
                     type: 'competitor',
                     at: daysAgo(1),
                  },
               ],
            }),
            rules,
            model,
            lines,
            { now: NOW }
         )
      ).toMatchObject({
         excluded: 'Excluded: competitor.',
         score: 0,
         tier: 'D',
      })
      expect(
         rankPerson(
            person({
               headline: 'Growth Intern',
               signals,
            }),
            rules,
            model,
            lines,
            {
               now: NOW,
               never,
            }
         ).excluded
      ).toBe('Excluded: title.')
      expect(
         rankPerson(
            person({
               company: 'rival inc',
               signals,
            }),
            rules,
            model,
            lines,
            {
               now: NOW,
               never,
            }
         ).excluded
      ).toBe('Excluded: company.')
   })

   it('should give no fit, and no crash, when the ideal customer asks for nothing', () => {
      const none: IcpRules = {
         includeTitles: [],
         excludeTitles: [],
         seniorities: [],
         locations: [],
      }

      expect(rankPerson(person(), none, model, lines, { now: NOW }).parts.fit).toBe(0)
   })

   it('should lean on what the model says', () => {
      const signals = [
         {
            type: 'asked' as const,
            at: daysAgo(0),
         },
      ]

      expect(rankPerson(person({ signals }), rules, modelOf('fitFirst'), lines, { now: NOW }).parts).toMatchObject({
         fit: 65,
         intent: 20,
      })
      expect(rankPerson(person({ signals }), rules, modelOf('intentFirst'), lines, { now: NOW }).parts).toMatchObject({
         fit: 35,
         intent: 20,
      })
   })

   it('should score what is shared as relationship, up to its part', () => {
      const signals = [
         {
            type: 'shared' as const,
            at: daysAgo(0),
         },
         {
            type: 'mutual' as const,
            at: daysAgo(0),
         },
      ]

      expect(rankPerson(person({ signals }), rules, model, lines, { now: NOW }).parts).toMatchObject({
         intent: 0,
         relationship: 6,
      })
   })
})

describe('rankCompany', () => {
   const wanted = {
      ...rules,
      problemKeywords: ['outreach'],
   }
   const company = {
      name: 'Acme',
      industry: 'Software Development',
      size: '51 - 200',
      location: 'Pune, India',
      specialities: ['Outreach tools'],
      tagline: null,
      signals: [],
   }

   it('should score fit from what the customer asks for and triggers from fresh company signals', () => {
      const plain = rankCompany(company, wanted, model, lines, { now: NOW })
      const hiring = rankCompany(
         {
            ...company,
            signals: [
               {
                  type: 'hiring',
                  at: daysAgo(0),
               },
            ],
         },
         wanted,
         model,
         lines,
         { now: NOW }
      )

      expect(plain.parts.fit).toBe(70)
      expect(hiring.parts.intent).toBe(15)
      expect(hiring.score).toBe(85)
      expect(hiring.tier).toBe('A')
      expect(plain.unread).toBe(false)
   })

   it('should say a company with no industry and size is not read, and exclude a never-rank company', () => {
      expect(
         rankCompany(
            {
               ...company,
               industry: null,
               size: null,
            },
            wanted,
            model,
            lines,
            { now: NOW }
         ).unread
      ).toBe(true)
      expect(
         rankCompany(company, wanted, model, lines, {
            now: NOW,
            never: {
               titles: [],
               companies: ['ACME'],
            },
         }).excluded
      ).toBe('Excluded: company.')
   })
})

describe('pickBestPer', () => {
   const people = [
      {
         slug: 'a1',
         company: 'A',
         score: 90,
         role: 'growth',
      },
      {
         slug: 'a2',
         company: 'A',
         score: 80,
         role: 'growth',
      },
      {
         slug: 'a3',
         company: 'A',
         score: 70,
         role: 'sales',
      },
      {
         slug: 'b1',
         company: 'B',
         score: 10,
         role: 'ops',
      },
      {
         slug: 'n1',
         company: null,
         score: 5,
         role: null,
      },
   ]
   const run = (per: number, spread: boolean) =>
      pickBestPer(
         people,
         each => each.company,
         each => each.score,
         each => each.role,
         per,
         spread
      )

   it('should keep the best few of each company, and everyone with no company', () => {
      expect(run(2, false).kept.map(each => each.slug)).toEqual(['a1', 'a2', 'b1', 'n1'])
      expect(run(2, false).rest.map(each => each.slug)).toEqual(['a3'])
   })

   it('should take one of each role before a second of one role', () => {
      expect(run(2, true).kept.map(each => each.slug)).toEqual(['a1', 'a3', 'b1', 'n1'])
   })
})

describe('spaceOutReason', () => {
   const options = {
      daysApart: 3,
      stopAfterReply: true,
      forDays: 14,
      now: NOW,
   }

   it('should let the first of a company with nothing recent go on', () => {
      expect(spaceOutReason(undefined, options, true)).toBeNull()
      expect(spaceOutReason(undefined, options, false)).toBe('Another colleague goes first.')
   })

   it('should hold back after a recent contact, and stop after a reply when asked', () => {
      expect(
         spaceOutReason(
            {
               lastContactAt: daysAgo(1),
               lastReplyAt: null,
            },
            options,
            true
         )
      ).toBe('A colleague was contacted lately.')
      expect(
         spaceOutReason(
            {
               lastContactAt: daysAgo(5),
               lastReplyAt: null,
            },
            options,
            true
         )
      ).toBeNull()
      expect(
         spaceOutReason(
            {
               lastContactAt: null,
               lastReplyAt: daysAgo(10),
            },
            options,
            true
         )
      ).toBe('A colleague replied.')
      expect(
         spaceOutReason(
            {
               lastContactAt: null,
               lastReplyAt: daysAgo(10),
            },
            {
               ...options,
               stopAfterReply: false,
            },
            true
         )
      ).toBeNull()
   })
})
