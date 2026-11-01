import { describe, expect, it } from 'vitest'

import {
   companyCardOf,
   companyRowFrom,
   companySnapshotFrom,
   postCardOf,
   postSnapshotFrom,
   readCompanySnapshot,
   readPostSnapshot,
} from './pageSnapshot'

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
         companyId: '2135371',
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
         industryCategory: null,
         address: {
            street: null,
            city: 'San Francisco',
            state: null,
            postalCode: null,
            country: 'US',
         },
         locations: [],
         jobsUrl: null,
         ctaUrl: null,
         active: null,
         showcase: false,
         linkedinUrl: null,
         companyId: '2135371',
         pageType: null,
         bySchool: [],
         byFieldOfStudy: [],
         byServiceCategory: [],
         detailed: true,
      })
      expect(readCompanySnapshot(snapshot)).toEqual(snapshot)
      expect(readCompanySnapshot({ name: 1 })).toBeNull()
   })

   it('should keep the address, offices, links and every breakdown of a full read', () => {
      const snapshot = companySnapshotFrom({
         companyName: 'Du Toit Yacht Design',
         website: 'http://dutoityachtdesign.co.za/',
         ctaUrl: 'http://dutoityachtdesign.co.za/',
         jobsUrl: 'https://www.linkedin.com/jobs/search?geoId=92000000&f_C=35591296',
         industryCategory: 'Maritime',
         hqStreet: 'Bolt Ave',
         hqCity: 'Montague Gardens',
         hqState: 'Western Cape',
         hqPostalCode: '7441',
         hqCountry: 'South Africa',
         locations: [
            {
               street: 'Bolt Ave',
               city: 'Montague Gardens',
               country: 'South Africa',
               postalCode: '7441',
            },
            'not an office',
         ],
         activeStatus: true,
         pageType: 'SHOWCASE',
         linkedinUrl: 'https://www.linkedin.com/company/du-toit-yacht-design/',
         employeesBySkill: Array.from({ length: 20 }, (_, index) => ({
            skill: `Skill ${index}`,
            count: 20 - index,
         })),
         employeesBySchool: [
            {
               school: 'University of Cape Town',
               count: 1,
            },
         ],
         employeesByFieldOfStudy: [
            {
               fieldOfStudy: 'Engineering',
               count: 2,
            },
         ],
         employeesByServiceCategory: [
            {
               serviceCategory: 'Design',
               count: 1,
            },
         ],
      })

      expect(snapshot).toMatchObject({
         website: 'http://dutoityachtdesign.co.za/',
         jobsUrl: 'https://www.linkedin.com/jobs/search?geoId=92000000&f_C=35591296',
         industryCategory: 'Maritime',
         address: {
            street: 'Bolt Ave',
            city: 'Montague Gardens',
            state: 'Western Cape',
            postalCode: '7441',
            country: 'South Africa',
         },
         locations: [
            {
               street: 'Bolt Ave',
               city: 'Montague Gardens',
               state: null,
               postalCode: '7441',
               country: 'South Africa',
            },
         ],
         active: true,
         showcase: true,
         pageType: 'SHOWCASE',
         linkedinUrl: 'https://www.linkedin.com/company/du-toit-yacht-design/',
         ctaUrl: 'http://dutoityachtdesign.co.za/',
         bySchool: [
            {
               label: 'University of Cape Town',
               count: 1,
            },
         ],
         byFieldOfStudy: [
            {
               label: 'Engineering',
               count: 2,
            },
         ],
         byServiceCategory: [
            {
               label: 'Design',
               count: 1,
            },
         ],
      })
      expect(snapshot.bySkill).toHaveLength(15)
   })

   it('should still read a snapshot kept before the full fields', () => {
      const old = {
         name: 'Stripe',
         tagline: null,
         about: null,
         logo: null,
         website: null,
         founded: null,
         employees: null,
         employeeRange: null,
         followers: null,
         industry: null,
         headquarters: null,
         specialities: [],
         verified: false,
         byFunction: [],
         byLocation: [],
         bySkill: [],
      }

      expect(readCompanySnapshot(old)).toMatchObject({
         name: 'Stripe',
         address: null,
         locations: [],
         bySchool: [],
         showcase: false,
         detailed: false,
      })
   })

   it('should refuse links that are not http or https, and a jobs link off LinkedIn', () => {
      const snapshot = companySnapshotFrom({
         logo: 'http://x',
         website: 'javascript:alert(1)',
         ctaUrl: 'ftp://example.com',
         jobsUrl: 'https://evil.example/jobs',
      })

      expect([snapshot.logo, snapshot.website, snapshot.ctaUrl, snapshot.jobsUrl]).toEqual([null, null, null, null])
   })
})

describe('companyRowFrom and companyCardOf', () => {
   it('should write the values a read has and leave the rest to the row', () => {
      const snapshot = companySnapshotFrom({
         companyName: 'Nova Technologies, Inc.',
         industry: 'Telecommunications',
         website: 'http://www.nova-tech.us',
         employeeCountRange: '11–50',
         hqCity: 'Plymouth',
         hqState: 'Minnesota',
         hqCountry: 'United States',
         logo: 'https://media.licdn.com/nova.png',
         employeeCount: 19,
         followers: 2952,
      })

      expect(companyRowFrom(snapshot)).toEqual({
         name: 'Nova Technologies, Inc.',
         industry: 'Telecommunications',
         website: 'http://www.nova-tech.us',
         size: '11–50',
         location: 'Plymouth, Minnesota, United States',
         country: 'United States',
      })
      expect(companyRowFrom(companySnapshotFrom({ companyName: 'Acme' }))).toEqual({
         name: 'Acme',
         industry: undefined,
         website: undefined,
         size: undefined,
         location: undefined,
         country: undefined,
      })
      expect(companyCardOf(snapshot)).toEqual({
         logo: 'https://media.licdn.com/nova.png',
         tagline: null,
         employees: 19,
         followers: 2952,
      })
      expect(companyCardOf({ name: 1 })).toBeNull()
   })

   it('should take the country from the headquarters line of an older read', () => {
      const old = readCompanySnapshot({
         ...companySnapshotFrom({}),
         headquarters: 'Montague Gardens, Western Cape, South Africa',
         address: undefined,
      })

      expect(old && companyRowFrom(old).country).toBe('South Africa')
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

describe('postCardOf', () => {
   it('should keep what a row shows, with the start of the text, and nothing for a read that does not fit', () => {
      const snapshot = postSnapshotFrom({
         postText: 'x'.repeat(400),
         authorName: 'Ada Lovelace',
         authorUrl: 'https://www.linkedin.com/in/ada',
         authorAvatar: 'https://media.example/ada.jpg',
         authorHeadline: 'Engines',
         authorFollowers: 1200,
         authorType: 'company',
         reactions: 40,
         comments: 12,
         shares: 3,
         postedDate: '2026-10-01',
      })

      expect(postCardOf(snapshot)).toEqual({
         author: {
            name: 'Ada Lovelace',
            avatar: 'https://media.example/ada.jpg',
            headline: 'Engines',
            isCompany: true,
         },
         text: 'x'.repeat(280),
         postedAt: '2026-10-01',
         reactions: 40,
         comments: 12,
      })
      expect(postCardOf({ text: 1 })).toBeNull()
   })
})
