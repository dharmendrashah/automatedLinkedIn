import { describe, expect, it, vi } from 'vitest'

import { commentersFrom, profilesFrom, reactorsFrom } from './operations'

// core's index also loads services that read env; these pure mappers need none of it.
vi.mock('env', () => ({}))

const post = {
   kind: 'post' as const,
   slug: 'activity-1',
   url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
   postId: 'p1',
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
})
