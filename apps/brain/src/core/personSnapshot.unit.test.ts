import { describe, expect, it } from 'vitest'

import { readSnapshot, snapshotFrom } from './personSnapshot'

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
