import { describe, expect, it } from 'vitest'

import { type Company } from './types'

import { buildChanges, toFormValues } from './company-form'

const company: Company = {
   id: 'c1',
   slug: 'elitale',
   url: 'https://www.linkedin.com/company/elitale',
   name: 'Elitale',
   industry: null,
   website: 'https://elitale.com',
   size: null,
   location: null,
   country: null,
   notes: null,
   tags: ['partner'],
   visits: [],
   status: 'NEW',
   archivedAt: null,
   createdAt: '2026-10-14T00:00:00.000Z',
   updatedAt: '2026-10-14T00:00:00.000Z',
   card: null,
   readAt: null,
   people: {
      count: 0,
      former: 0,
      first: [],
   },
}

describe('buildChanges for a company', () => {
   it('should send nothing when the form is untouched', () => {
      expect(buildChanges(company, toFormValues(company))).toEqual({})
   })

   it('should send only the fields that changed and clear an emptied one', () => {
      const values = {
         ...toFormValues(company),
         industry: ' Software ',
         website: '  ',
         status: 'CONTACTED' as const,
      }

      expect(buildChanges(company, values)).toEqual({
         industry: 'Software',
         website: null,
         status: 'CONTACTED',
      })
   })
})
