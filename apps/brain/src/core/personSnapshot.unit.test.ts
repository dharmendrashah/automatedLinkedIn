import { describe, expect, it } from 'vitest'

import { companiesOf, profileFacts, readSnapshot, snapshotFrom } from './personSnapshot'

describe('snapshotFrom', () => {
   it('should keep only the allow-listed fields, in a LinkedIn-like shape', () => {
      const snapshot = snapshotFrom({
         firstName: 'Ada',
         lastName: 'Lovelace',
         headline: 'Engines',
         city: 'London',
         country: 'United Kingdom',
         about: 'I write programs.',
         photo: 'https://media.example/ada.jpg',
         followers: 1200,
         connections: 500,
         openToWork: true,
         hiring: false,
         profileId: 'internal-id',
         email: 'ada@example.com',
         experience: [
            {
               position: 'Analyst',
               companyName: 'Analytical Engines',
               location: 'London',
               startDate: {
                  year: 1842,
                  month: 7,
               },
               endDate: null,
               description: 'Notes on the engine.',
               companyId: 'internal',
            },
         ],
         education: [
            {
               schoolName: 'Home',
               degree: 'Mathematics',
               fieldOfStudy: 'Algebra',
               startDate: '1830',
               endDate: '1835',
            },
         ],
         skills: ['Mathematics', { name: 'Poetry' }],
      })

      expect(snapshot).toEqual({
         name: 'Ada Lovelace',
         headline: 'Engines',
         location: 'London, United Kingdom',
         country: 'United Kingdom',
         about: 'I write programs.',
         photo: 'https://media.example/ada.jpg',
         cover: null,
         premium: null,
         verified: null,
         creator: null,
         followers: 1200,
         connections: 500,
         openToWork: true,
         hiring: false,
         experience: [
            {
               title: 'Analyst',
               company: 'Analytical Engines',
               companyUrl: null,
               location: 'London',
               start: '7/1842',
               end: null,
               description: 'Notes on the engine.',
            },
         ],
         education: [
            {
               school: 'Home',
               degree: 'Mathematics',
               field: 'Algebra',
               start: '1830',
               end: '1835',
            },
         ],
         skills: ['Mathematics', 'Poetry'],
      })
      expect(JSON.stringify(snapshot)).not.toMatch(/internal|ada@example/)
   })

   it('should read back a stored snapshot and drop one that does not fit', () => {
      expect(readSnapshot(snapshotFrom({ firstName: 'Ada' }))).toMatchObject({
         name: 'Ada',
         experience: [],
      })
      expect(readSnapshot({ name: 3 })).toBeNull()
   })

   it('should refuse a photo that is not an https link', () => {
      expect(snapshotFrom({ photo: 'javascript:alert(1)' }).photo).toBeNull()
   })
})

describe('profileFacts', () => {
   const read = (row: Record<string, unknown>) => {
      const snapshot = readSnapshot(snapshotFrom(row))

      if (!snapshot) {
         throw new Error('no snapshot')
      }

      return profileFacts(snapshot)
   }

   it('should take the title and company of the position that has not ended, and the country', () => {
      expect(
         read({
            city: 'Lyon',
            country: 'France',
            experience: [
               {
                  position: 'Advisor',
                  companyName: 'Old Co',
                  endDate: '2020',
               },
               {
                  position: 'Founder',
                  companyName: 'Lumen Labs',
                  endDate: null,
               },
            ],
         })
      ).toEqual({
         name: null,
         headline: null,
         photo: null,
         title: 'Founder',
         company: 'Lumen Labs',
         companySlug: null,
         country: 'France',
         premium: null,
      })
   })

   it('should give the name, headline and photo of the read', () => {
      expect(
         read({
            firstName: 'Prince',
            lastName: 'Patel',
            headline: 'Magento lead',
            photo: 'https://media.example/prince.jpg',
         })
      ).toMatchObject({
         name: 'Prince Patel',
         headline: 'Magento lead',
         photo: 'https://media.example/prince.jpg',
      })
   })

   it("should keep the current company's LinkedIn link, the cover and the badges, as the data service names them", () => {
      const row = {
         premium: true,
         verified: true,
         creator: false,
         coverPhoto: 'https://media.example/cover.jpg',
         experience: [
            {
               position: 'Founder',
               companyName: 'Lumen Labs',
               companyLinkedinUrl: 'https://www.linkedin.com/company/Lumen-Labs/about/',
               endDate: null,
            },
         ],
      }

      expect(snapshotFrom(row)).toMatchObject({
         cover: 'https://media.example/cover.jpg',
         premium: true,
         verified: true,
         creator: false,
         experience: [{ companyUrl: 'https://www.linkedin.com/company/lumen-labs' }],
      })
      expect(read(row)).toMatchObject({
         companySlug: 'lumen-labs',
         premium: true,
      })
   })

   it('should drop a company link that is not a LinkedIn company, and a cover that is not https', () => {
      const snapshot = snapshotFrom({
         coverPhoto: 'http://media.example/cover.jpg',
         premium: 'yes',
         verified: 1,
         experience: [{ companyLinkedinUrl: 'https://evil.example/company/x' }],
      })

      expect(snapshot).toMatchObject({
         cover: null,
         premium: null,
         verified: null,
         experience: [{ companyUrl: null }],
      })
   })

   it('should fall back to the newest position, and to the last part of an older read location', () => {
      const older = readSnapshot({
         ...snapshotFrom({
            experience: [
               {
                  position: 'Analyst',
                  companyName: 'Engines',
                  endDate: '1850',
               },
            ],
         }),
         country: undefined,
         location: 'London, United Kingdom',
      })

      expect(older && profileFacts(older)).toEqual({
         name: null,
         headline: null,
         photo: null,
         title: 'Analyst',
         company: 'Engines',
         companySlug: null,
         country: 'United Kingdom',
         premium: null,
      })
   })

   it('should not take a lone place for a country', () => {
      expect(read({ city: 'London' })).toEqual({
         name: null,
         headline: null,
         photo: null,
         title: null,
         company: null,
         companySlug: null,
         country: null,
         premium: null,
      })
   })
})

describe('companiesOf', () => {
   it('should list every LinkedIn company of the experience once, with the first name seen', () => {
      const snapshot = snapshotFrom({
         experience: [
            {
               companyName: 'Rivulet iQ',
               companyLinkedinUrl: 'https://www.linkedin.com/company/rivuletiq/',
            },
            {
               companyName: 'Rivulet',
               companyLinkedinUrl: 'https://www.linkedin.com/company/RivuletIQ',
            },
            { companyName: 'Freelance' },
            {
               companyName: null,
               companyLinkedinUrl: 'https://www.linkedin.com/company/15112477/',
            },
         ],
      })

      expect(companiesOf(snapshot)).toEqual([
         {
            slug: 'rivuletiq',
            name: 'Rivulet iQ',
         },
         {
            slug: '15112477',
            name: null,
         },
      ])
   })
})
