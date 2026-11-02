import { describe, expect, it } from 'vitest'

import { aboutSnippet, templateValues } from './templateValues'

const now = new Date('2026-11-03T12:00:00Z')

describe('templateValues', () => {
   it('should give the name parts, the current job and the earlier one, from a profile read', () => {
      const values = templateValues(
         {
            name: 'Ada King Lovelace',
            headline: 'Founder',
            experience: [
               {
                  title: 'Founder',
                  company: 'Analytical Engines',
                  end: null,
               },
               {
                  title: 'Mathematician',
                  company: 'Babbage and Co',
                  end: '2020',
               },
            ],
            education: [{ school: 'University of London' }],
            skills: ['Mathematics', 'Poetry'],
         },
         {
            slug: 'ada',
            accountFirstName: 'Sam',
            now,
         }
      )

      expect(values).toMatchObject({
         first_name: 'Ada',
         last_name: 'King Lovelace',
         full_name: 'Ada King Lovelace',
         company: 'Analytical Engines',
         title: 'Founder',
         previous_company: 'Babbage and Co',
         previous_title: 'Mathematician',
         school: 'University of London',
         top_skill: 'Mathematics',
         account_first_name: 'Sam',
      })
   })

   it('should prefer the company and title the person already has, and not call a job at the same company an earlier one', () => {
      const values = templateValues(
         {
            company: 'Acme',
            title: 'CTO',
            experience: [
               {
                  title: 'VP',
                  company: 'Acme',
                  end: '2023',
               },
               {
                  title: 'Engineer',
                  company: 'Globex',
                  end: '2019',
               },
            ],
         },
         {
            slug: 'bob',
            now,
         }
      )

      expect(values).toMatchObject({
         company: 'Acme',
         title: 'CTO',
         previous_company: 'Globex',
         previous_title: 'Engineer',
      })
   })

   it('should leave the name out for an address, "unknown" or nothing, and anything else out when it is not known', () => {
      for (const name of ['ada-lovelace', 'Unknown', 'LinkedIn', null, '  ']) {
         expect(
            templateValues(
               { name },
               {
                  slug: 'ada-lovelace',
                  now,
               }
            )
         ).toMatchObject({
            first_name: undefined,
            full_name: undefined,
         })
      }

      expect(
         templateValues(
            {},
            {
               slug: 'x',
               now,
            }
         ).company
      ).toBeUndefined()
   })

   it('should read the newest comment and reaction, with who wrote the post and when, in words', () => {
      const post = (name: string) => ({
         text: null,
         author: {
            name,
            url: null,
            avatar: null,
            headline: null,
            followers: null,
            isCompany: false,
         },
         reactions: null,
         comments: null,
         shares: null,
         postedAt: null,
         media: null,
         articleUrl: null,
         repostNote: null,
      })
      const values = templateValues(
         {
            connectedAt: '2026-10-13T12:00:00Z',
            signals: [
               {
                  type: 'commented',
                  via: 'p1',
                  at: '2026-10-01T10:00:00Z',
                  excerpt: 'Old comment',
                  post: post('Old Author'),
               },
               {
                  type: 'commented',
                  via: 'p2',
                  at: '2026-10-29T10:00:00Z',
                  excerpt: 'Great point',
                  post: post('Charles Babbage'),
               },
               {
                  type: 'reacted',
                  via: 'p3',
                  at: '2026-10-30T12:00:00Z',
                  excerpt: null,
                  post: post('Grace Hopper'),
               },
            ],
         },
         {
            slug: 'ada',
            now,
         }
      )

      expect(values).toMatchObject({
         commented_on: 'Charles Babbage',
         comment_excerpt: 'Great point',
         commented_ago: '5 days ago',
         commented_date: '29 Oct 2026',
         reacted_to: 'Grace Hopper',
         reacted_ago: '4 days ago',
         connected_ago: '3 weeks ago',
         connected_date: '13 Oct 2026',
      })
   })
})

describe('aboutSnippet', () => {
   it('should take the first sentence, cut a long one at a word, and give nothing for nothing', () => {
      expect(aboutSnippet('I write programs. Then I sleep.')).toBe('I write programs.')
      expect(aboutSnippet(`${'word '.repeat(40)}end.`)?.length).toBeLessThanOrEqual(121)
      expect(aboutSnippet(`${'word '.repeat(40)}end.`)).toMatch(/word…$/)
      expect(aboutSnippet('  ')).toBeUndefined()
      expect(aboutSnippet(null)).toBeUndefined()
   })
})
