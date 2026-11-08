import { describe, expect, it } from 'vitest'

import { type OwnedFound, linksOf } from './workflowOutputLinks'

const found: OwnedFound = {
   people: new Map([['ada', 'person-1']]),
   companies: new Set(['acme']),
}

describe('linksOf', () => {
   it('gives a profile the id of its person row', () => {
      expect(
         linksOf(
            {
               kind: 'profile',
               slug: 'ada',
            },
            found
         )
      ).toEqual({ personId: 'person-1' })
   })

   it('gives a profile outside My network a null person id', () => {
      expect(
         linksOf(
            {
               kind: 'profile',
               slug: 'grace',
            },
            found
         )
      ).toEqual({ personId: null })
   })

   it('says a company is in the owner list only when it is', () => {
      expect(
         linksOf(
            {
               kind: 'company',
               slug: 'acme',
            },
            found
         )
      ).toEqual({ inApp: true })
      expect(
         linksOf(
            {
               kind: 'company',
               slug: 'globex',
            },
            found
         )
      ).toEqual({ inApp: false })
   })

   it('adds nothing for posts, jobs, ads and conversations', () => {
      expect(
         linksOf(
            {
               kind: 'post',
               slug: 'activity-1',
            },
            found
         )
      ).toEqual({})
      expect(
         linksOf(
            {
               kind: 'job',
               slug: '99',
            },
            found
         )
      ).toEqual({})
   })
})
