import { describe, expect, it } from 'vitest'

import { type Profile } from './types'

import { buildChanges, toFormValues, toTagList } from './profile-form'

const profile: Profile = {
   id: 'p1',
   slug: 'ada-lovelace',
   url: 'https://www.linkedin.com/in/ada-lovelace',
   fullName: 'Ada Lovelace',
   headline: null,
   company: 'Analytical Engines',
   location: null,
   notes: null,
   tags: ['vip', 'lead'],
   status: 'NEW',
   archivedAt: null,
   createdAt: '2026-10-14T00:00:00.000Z',
   updatedAt: '2026-10-14T00:00:00.000Z',
}

describe('toTagList', () => {
   it('should split on commas, lowercase, trim and drop empty and repeated tags', () => {
      expect(toTagList(' VIP, lead ,, vip ,')).toEqual(['vip', 'lead'])
   })
})

describe('buildChanges', () => {
   it('should send nothing when the form is untouched', () => {
      expect(buildChanges(profile, toFormValues(profile))).toEqual({})
   })

   it('should send only the fields that changed', () => {
      const values = {
         ...toFormValues(profile),
         headline: ' Mathematician ',
         status: 'REPLIED' as const,
      }

      expect(buildChanges(profile, values)).toEqual({
         headline: 'Mathematician',
         status: 'REPLIED',
      })
   })

   it('should clear a text field that was emptied', () => {
      const values = {
         ...toFormValues(profile),
         company: '  ',
      }

      expect(buildChanges(profile, values)).toEqual({ company: null })
   })

   it('should treat a retyped tag list in another case or spacing as unchanged', () => {
      const values = {
         ...toFormValues(profile),
         tags: 'VIP,  lead',
      }

      expect(buildChanges(profile, values)).toEqual({})
   })

   it('should send the cleaned tag list when it changed', () => {
      const values = {
         ...toFormValues(profile),
         tags: 'vip, new-hire',
      }

      expect(buildChanges(profile, values)).toEqual({ tags: ['vip', 'new-hire'] })
   })
})
