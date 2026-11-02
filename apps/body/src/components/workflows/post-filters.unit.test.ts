import { describe, expect, it } from 'vitest'

import { postFiltersSchema } from '@automatedLinkedIn/contracts'

import { postChips, postFiltersText, readPostFilters } from './post-filters'

describe('the filters of a Posts block', () => {
   it('should keep only what is on, as brain accepts it, and read it back', () => {
      const filters = {
         read: 'READ' as const,
         minComments: 10,
         author: 'Ada',
         hasQualified: true,
      }
      const text = postFiltersText({
         ...filters,
         minReactions: undefined,
      })

      expect(JSON.parse(text)).toEqual(filters)
      expect(postFiltersSchema.safeParse(JSON.parse(text)).success).toBe(true)
      expect(readPostFilters(text)).toEqual(filters)
   })

   it('should keep nothing for no filters, read text that is not filters as none, and chip each filter on', () => {
      expect(postFiltersText({ hasQualified: false })).toBe('')
      expect(readPostFilters('')).toEqual({})
      expect(readPostFilters('oops')).toEqual({})
      expect(readPostFilters('{"minComments":0}')).toEqual({})
      expect(postChips({ read: 'UNREAD', minReactions: 5 }).map(({ text }) => text)).toEqual([
         'Not read yet',
         '5+ reactions',
      ])
   })
})
