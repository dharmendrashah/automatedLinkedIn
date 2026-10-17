import { describe, expect, it } from 'vitest'

import { companySnapshotFrom, postSnapshotFrom, readCompanySnapshot, readPostSnapshot } from './pageSnapshot'

describe('companySnapshotFrom', () => {
   it('should keep the company page fields and the top of each employee breakdown', () => {
      const snapshot = companySnapshotFrom({
         companyName: 'Stripe',
         tagline: 'Payments infrastructure',
         description: 'We build payments.',
         logo: 'https://media.example/stripe.png',
         website: 'https://stripe.com',
         foundedYear: 2010,
         employeeCount: 8000,
         employeeCountRange: '5001-10000',
         followers: 900000,
         industry: 'Software Development',
         hqCity: 'San Francisco',
         hqCountry: 'US',
         specialities: ['Payments', 'APIs'],
         verified: true,
         companyId: 'internal',
         employeesByFunction: [
            {
               function: 'Engineering',
               count: 3000,
            },
            {
               function: 'Sales',
               count: 900,
            },
         ],
         employeesByLocation: [
            {
               location: 'Dublin',
               count: 1000,
            },
         ],
         employeesBySkill: 'not a list',
      })

      expect(snapshot).toEqual({
         name: 'Stripe',
         tagline: 'Payments infrastructure',
         about: 'We build payments.',
         logo: 'https://media.example/stripe.png',
         website: 'https://stripe.com',
         founded: 2010,
         employees: 8000,
         employeeRange: '5001-10000',
         followers: 900000,
         industry: 'Software Development',
         headquarters: 'San Francisco, US',
         specialities: ['Payments', 'APIs'],
         verified: true,
         byFunction: [
            {
               label: 'Engineering',
               count: 3000,
            },
            {
               label: 'Sales',
               count: 900,
            },
         ],
         byLocation: [
            {
               label: 'Dublin',
               count: 1000,
            },
         ],
         bySkill: [],
      })
      expect(readCompanySnapshot(snapshot)).toEqual(snapshot)
      expect(readCompanySnapshot({ name: 1 })).toBeNull()
   })

   it('should refuse links that are not https', () => {
      const snapshot = companySnapshotFrom({
         logo: 'http://x',
         website: 'javascript:alert(1)',
      })

      expect([snapshot.logo, snapshot.website]).toEqual([null, null])
   })
})

describe('postSnapshotFrom', () => {
   it('should keep the post, its author and its numbers', () => {
      const snapshot = postSnapshotFrom({
         postText: 'Pipeline is hard.',
         authorName: 'Ada Lovelace',
         authorUrl: 'https://www.linkedin.com/in/ada',
         authorAvatar: 'https://media.example/ada.jpg',
         authorHeadline: 'Engines',
         authorFollowers: 1200,
         authorType: 'person',
         authorProfileId: 'internal',
         reactions: 40,
         comments: 12,
         shares: 3,
         postedDate: '2026-10-01',
         postMediaUrl: 'https://media.example/chart.png',
         postMediaType: 'image',
         articleUrl: null,
         repostNote: null,
      })

      expect(snapshot).toEqual({
         text: 'Pipeline is hard.',
         author: {
            name: 'Ada Lovelace',
            url: 'https://www.linkedin.com/in/ada',
            avatar: 'https://media.example/ada.jpg',
            headline: 'Engines',
            followers: 1200,
            isCompany: false,
         },
         reactions: 40,
         comments: 12,
         shares: 3,
         postedAt: '2026-10-01',
         media: {
            url: 'https://media.example/chart.png',
            type: 'image',
         },
         articleUrl: null,
         repostNote: null,
      })
      expect(readPostSnapshot(snapshot)).toEqual(snapshot)
      expect(JSON.stringify(snapshot)).not.toContain('internal')
   })
})
