import { describe, expect, it } from 'vitest'

import { profileFacts, readSnapshot, snapshotFrom } from './personSnapshot'

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
         followers: 1200,
         connections: 500,
         openToWork: true,
         hiring: false,
         experience: [
            {
               title: 'Analyst',
               company: 'Analytical Engines',
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
         title: 'Founder',
         company: 'Lumen Labs',
         country: 'France',
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
         title: 'Analyst',
         company: 'Engines',
         country: 'United Kingdom',
      })
   })

   it('should not take a lone place for a country', () => {
      expect(read({ city: 'London' })).toEqual({
         title: null,
         company: null,
         country: null,
      })
   })
})
