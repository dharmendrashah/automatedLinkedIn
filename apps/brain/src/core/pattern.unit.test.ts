import { describe, expect, it } from 'vitest'

import { type PatternPerson, findPattern, newRoleOf, startOf } from './pattern'
import { type PersonSnapshotData } from './personSnapshot'

const snapshot = (changes: Partial<PersonSnapshotData> = {}): PersonSnapshotData => ({
   name: 'Ada',
   headline: null,
   location: 'Pune, India',
   country: 'India',
   about: null,
   photo: null,
   followers: null,
   connections: null,
   openToWork: false,
   hiring: false,
   experience: [],
   education: [],
   skills: [],
   ...changes,
})

const role = (title: string, company: string, start: string | null, end: string | null = null) => ({
   title,
   company,
   companyUrl: null,
   location: null,
   start,
   end,
   description: null,
})

const person = (data: PersonSnapshotData | null, extra: Partial<PatternPerson> = {}): PatternPerson => ({
   snapshot: data,
   companySize: null,
   companyIndustry: null,
   ...extra,
})

describe('findPattern', () => {
   const people = [
      person(
         snapshot({
            experience: [role('Head of Growth', 'Acme', '2024')],
            education: [
               {
                  school: 'IIT',
                  degree: null,
                  field: null,
                  start: null,
                  end: null,
               },
            ],
            skills: ['SEO', 'Ads'],
         }),
         { companySize: '51-200' }
      ),
      person(
         snapshot({
            experience: [role('head of growth', 'ACME', '2023')],
            education: [
               {
                  school: 'IIT',
                  degree: null,
                  field: null,
                  start: null,
                  end: null,
               },
               {
                  school: 'IIT',
                  degree: 'MBA',
                  field: null,
                  start: null,
                  end: null,
               },
            ],
            skills: ['seo'],
         }),
         { companySize: '51-200' }
      ),
      person(snapshot({ experience: [role('Founder', 'Beta', '2020')] })),
      person(null),
   ]

   it('should count each value once per person, ignoring case, with the share of the people who have the part', () => {
      const found = findPattern(people, ['titles', 'companies', 'schools', 'skills', 'sizes', 'places'], 2)

      expect(found.people).toBe(4)
      expect(found.read).toBe(3)
      expect(found.parts.titles).toEqual([
         {
            value: 'Head of Growth',
            count: 2,
            share: 67,
         },
         {
            value: 'Founder',
            count: 1,
            share: 33,
         },
      ])
      expect(found.parts.companies?.[0]).toEqual({
         value: 'Acme',
         count: 2,
         share: 67,
      })
      expect(found.parts.schools).toEqual([
         {
            value: 'IIT',
            count: 2,
            share: 100,
         },
      ])
      expect(found.parts.skills?.[0]).toEqual({
         value: 'SEO',
         count: 2,
         share: 100,
      })
      expect(found.parts.sizes).toEqual([
         {
            value: '51-200',
            count: 2,
            share: 100,
         },
      ])
      expect(found.parts.places).toEqual([
         {
            value: 'India',
            count: 3,
            share: 100,
         },
      ])
   })

   it('should look only at the parts asked for, and give an empty list for a part nobody has', () => {
      expect(Object.keys(findPattern(people, ['industries'], 5).parts)).toEqual(['industries'])
      expect(findPattern(people, ['industries'], 5).parts.industries).toEqual([])
   })
})

describe('startOf', () => {
   it('should read the forms a read gives', () => {
      expect(startOf('3/2026')?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
      expect(startOf('2026-03-15')?.toISOString()).toBe('2026-03-15T00:00:00.000Z')
      expect(startOf('2026')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
      expect(startOf('Mar 2026')).toBeInstanceOf(Date)
   })

   it('should give nothing for text that is not a date', () => {
      expect(startOf(null)).toBeNull()
      expect(startOf('')).toBeNull()
      expect(startOf('soon')).toBeNull()
   })
})

describe('newRoleOf', () => {
   const now = new Date('2026-11-01T00:00:00Z')

   it('should find the newest position that has not ended and started inside the window', () => {
      const experience = [role('Head of Growth', 'Beta', '9/2026'), role('Growth Lead', 'Acme', '2022', '8/2026')]
      const found = newRoleOf(snapshot({ experience }), 90, now)

      expect(found).toEqual({
         role: 'Head of Growth',
         since: '2026-09-01',
      })
   })

   it('should not count an old role, one that ended, one with no start date or one that starts in the future', () => {
      expect(newRoleOf(snapshot({ experience: [role('A', 'x', '2024')] }), 90, now)).toBeNull()
      expect(newRoleOf(snapshot({ experience: [role('A', 'x', '10/2026', '11/2026')] }), 90, now)).toBeNull()
      expect(newRoleOf(snapshot({ experience: [role('A', 'x', null)] }), 90, now)).toBeNull()
      expect(newRoleOf(snapshot({ experience: [role('A', 'x', '2027-01-01')] }), 90, now)).toBeNull()
      expect(newRoleOf(snapshot(), 90, now)).toBeNull()
   })

   it('should count a role that started on the edge of the window', () => {
      expect(newRoleOf(snapshot({ experience: [role('A', 'x', '2026-08-03')] }), 90, now)?.since).toBe('2026-08-03')
   })
})
