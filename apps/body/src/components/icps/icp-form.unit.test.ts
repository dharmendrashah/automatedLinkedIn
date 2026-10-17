import { describe, expect, it } from 'vitest'

import { type Icp, splitWords, toFormValues, toInput } from './icp-form'

describe('icp form', () => {
   it('should split comma lists and drop empty entries', () => {
      expect(splitWords(' growth ,, sales,')).toEqual(['growth', 'sales'])
   })

   it('should turn a saved ideal customer into form values and back', () => {
      const icp = {
         id: 'i1',
         name: 'Founders',
         includeTitles: ['founder', 'ceo'],
         excludeTitles: [],
         seniorities: ['OWNER', 'UNKNOWN'],
         industries: [],
         companySizes: ['11-50'],
         locations: ['london'],
         problemKeywords: [],
         createdAt: '2026-10-17T00:00:00.000Z',
         updatedAt: '2026-10-17T00:00:00.000Z',
      } satisfies Icp

      expect(toInput(toFormValues(icp))).toEqual({
         name: 'Founders',
         includeTitles: ['founder', 'ceo'],
         excludeTitles: [],
         seniorities: ['OWNER'],
         industries: [],
         companySizes: ['11-50'],
         locations: ['london'],
         problemKeywords: [],
      })
   })
})
