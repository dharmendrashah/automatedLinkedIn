import { describe, expect, it, vi } from 'vitest'

import {
   cardFromSnapshot,
   commentersFrom,
   companiesFromDomains,
   employeesFrom,
   hiringFrom,
   postsFrom,
   profilesFrom,
   reactorsFrom,
} from './operations'

// core's index also loads services that read env; these pure mappers need none of it.
vi.mock('env', () => ({}))

const post = {
   kind: 'post' as const,
   slug: 'activity-1',
   url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
   postId: 'p1',
}

const company = {
   kind: 'company' as const,
   slug: 'acme',
   url: 'https://www.linkedin.com/company/acme',
   name: 'Acme',
   hiring: [],
}

describe('operations', () => {
   it('should keep commenting people with a short excerpt and drop companies, the author and photos', () => {
      const people = commentersFrom(
         [
            {
               commenterName: 'Ada',
               commenterHeadline: 'VP Growth',
               commenterUrl: 'https://www.linkedin.com/in/Ada-L',
               commenterFollowers: 900,
               commenterPhoto: 'https://media.licdn.com/x',
               commenterType: 'profile',
               comment: 'x'.repeat(500),
               commentedAt: '2026-10-01T00:00:00Z',
            },
            {
               commenterUrl: 'https://www.linkedin.com/company/acme',
               commenterType: 'company',
            },
            {
               commenterUrl: 'https://www.linkedin.com/in/author',
               isAuthor: true,
            },
         ],
         post
      )

      expect(people).toHaveLength(1)
      expect(people[0]).toMatchObject({
         slug: 'ada-l',
         name: 'Ada',
         followers: 900,
      })
      expect(people[0].signals[0].excerpt).toHaveLength(140)
      expect(JSON.stringify(people)).not.toContain('licdn')
   })

   it('should keep reactors with their location', () => {
      expect(
         reactorsFrom(
            [
               {
                  reactorUrl: 'https://www.linkedin.com/in/grace',
                  reactorLocation: 'London',
               },
               { reactorUrl: 'not a link' },
            ],
            post
         )
      ).toEqual([
         expect.objectContaining({
            slug: 'grace',
            location: 'London',
         }),
      ])
   })

   it('should read the current role and location of a full profile', () => {
      const cards = profilesFrom([
         {
            profileUrl: 'https://www.linkedin.com/in/ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            headline: 'Head of Sales',
            city: 'London',
            country: 'United Kingdom',
            experience: [
               {
                  position: 'Advisor',
                  companyName: 'Old Co',
                  endDate: '2020',
               },
               {
                  position: 'Head of Sales',
                  companyName: 'Acme',
                  endDate: 'Present',
               },
            ],
            about: { text: 'not kept' },
         },
      ])

      expect(cards.get('ada')).toEqual({
         name: 'Ada Lovelace',
         headline: 'Head of Sales',
         location: 'London, United Kingdom',
         followers: null,
         title: 'Head of Sales',
         company: 'Acme',
      })
   })

   it('should keep found posts without a posts-list id, so they are never marked done', () => {
      expect(
         postsFrom([
            { postUrl: 'https://www.linkedin.com/posts/ada_growth-activity-7516986460906954752-AbCd?utm=x' },
            { postUrl: 'nope' },
         ])
      ).toEqual([
         expect.objectContaining({
            kind: 'post',
            postId: null,
         }),
      ])
   })

   it('should keep the whole post found, and hand it to the people who engaged with it', () => {
      const text = 'Pipeline is hard. '.repeat(100).trim()
      const [found] = postsFrom([
         {
            postUrl: 'https://www.linkedin.com/posts/ada_growth-activity-7516986460906954752-AbCd',
            postText: text,
            authorName: 'Ada',
            reactions: 120,
         },
      ])

      expect(found.preview).toMatchObject({
         text,
         author: { name: 'Ada' },
         reactions: 120,
      })

      const [reactor] = reactorsFrom([{ reactorUrl: 'https://www.linkedin.com/in/grace' }], found)

      expect(reactor.signals[0].post?.text).toBe(text)
   })

   it('should build the same card from a full profile already read', () => {
      const role = {
         location: null,
         start: null,
         description: null,
      }

      expect(
         cardFromSnapshot({
            name: 'Ada Lovelace',
            headline: 'Head of Sales',
            location: 'London',
            about: null,
            photo: null,
            followers: 10,
            connections: null,
            openToWork: false,
            hiring: false,
            experience: [
               {
                  ...role,
                  title: 'Advisor',
                  company: 'Old Co',
                  end: '2020',
               },
               {
                  ...role,
                  title: 'Head of Sales',
                  company: 'Acme',
                  end: null,
               },
            ],
            education: [],
            skills: [],
         })
      ).toEqual({
         name: 'Ada Lovelace',
         headline: 'Head of Sales',
         location: 'London',
         followers: 10,
         title: 'Head of Sales',
         company: 'Acme',
      })
   })

   it('should read employees as already enriched, with a hiring reason when the company hires', () => {
      const [employee] = employeesFrom(
         [
            {
               profileUrl: 'https://www.linkedin.com/in/grace',
               headline: 'VP Sales',
            },
            { profileUrl: 'not a link' },
         ],
         {
            ...company,
            hiring: ['SDR'],
         }
      )

      expect(employee).toMatchObject({
         slug: 'grace',
         enriched: true,
         signals: [
            {
               type: 'hiring',
               via: company.url,
               excerpt: 'SDR',
            },
         ],
      })
   })

   it('should match open roles to companies by link or by name, once per title', () => {
      const roles = hiringFrom(
         [
            {
               companyUrl: 'https://www.linkedin.com/company/acme',
               jobTitle: 'SDR',
            },
            {
               companyName: 'ACME',
               jobTitle: 'SDR',
            },
            {
               companyName: 'Other',
               jobTitle: 'CTO',
            },
         ],
         [company]
      )

      expect(roles).toEqual(new Map([['acme', ['SDR']]]))
   })

   it('should turn websites into companies and drop rows without a company link', () => {
      expect(
         companiesFromDomains([
            {
               domain: 'acme.com',
               linkedinUrl: 'https://www.linkedin.com/company/acme',
            },
            { domain: 'none.com' },
         ])
      ).toEqual([
         {
            kind: 'company',
            slug: 'acme',
            url: expect.any(String),
            name: 'acme.com',
            hiring: [],
         },
      ])
   })
})
