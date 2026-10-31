import { describe, expect, it } from 'vitest'

import { NO_FILTERS, apiFilters, chipsOf, readFilters, writeFilters } from './model'

const icpName = () => 'EU MSPs'

describe('company filters', () => {
   it('should keep only what is on in the address and read it back', () => {
      const filters = {
         ...NO_FILTERS,
         sizes: ['11-50'],
         founded: { min: 2000 },
         team: [
            {
               kind: 'department' as const,
               values: ['Sales'],
               min: 5,
            },
         ],
         hasJobs: true,
      }
      const written = writeFilters(filters)

      expect(JSON.parse(written ?? '{}')).toEqual({
         sizes: ['11-50'],
         founded: { min: 2000 },
         team: [
            {
               kind: 'department',
               values: ['Sales'],
               min: 5,
            },
         ],
         hasJobs: true,
      })
      expect(readFilters(written)).toEqual(filters)
      expect(writeFilters(NO_FILTERS)).toBeNull()
      expect(readFilters('{"sizes":"not a list"}')).toEqual(NO_FILTERS)
      expect(readFilters('not json')).toEqual(NO_FILTERS)
   })

   it('should ask brain for schools and fields as team rules, words as a list, and nothing that is off', () => {
      expect(
         apiFilters({
            ...NO_FILTERS,
            icpId: 'icp-1',
            words: ' voip, , cloud ',
            wordsMatch: 'all',
            schools: ['UCT'],
            team: [
               {
                  kind: 'skill',
                  values: [],
                  min: 2,
               },
            ],
            verified: false,
         })
      ).toEqual({
         icpId: 'icp-1',
         icpIncludeUnread: false,
         team: [
            {
               kind: 'school',
               values: ['UCT'],
               min: 1,
            },
         ],
         words: {
            values: ['voip', 'cloud'],
            match: 'all',
         },
         verified: false,
      })
      expect(apiFilters(NO_FILTERS)).toEqual({})
   })

   it('should show one removable chip per filter that is on', () => {
      const filters = {
         ...NO_FILTERS,
         icpId: 'icp-1',
         team: [
            {
               kind: 'department' as const,
               values: ['Sales', 'Marketing', 'Engineering'],
               min: 3,
            },
         ],
         read: 'never' as const,
         followers: { max: 5000 },
      }
      const chips = chipsOf(filters, icpName)

      expect(chips.map(({ text }) => text)).toEqual([
         'Matches ICP: EU MSPs',
         'At least 3 in department Sales, Marketing +1',
         'Never read',
         'Followers: up to 5,000',
      ])
      expect(chips[1]?.clear).toEqual({ team: [] })
   })
})
