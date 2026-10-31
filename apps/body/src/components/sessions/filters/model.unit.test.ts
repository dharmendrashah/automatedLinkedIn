import { describe, expect, it } from 'vitest'

import { NO_FILTERS, apiFilters, chipsOf, readFilters, writeFilters } from './model'

const names = {
   account: (id: string) => `acc ${id}`,
   task: (task: string) => task.toUpperCase(),
   verdict: (verdict: string) => verdict.toLowerCase(),
   proxy: (id: string) => `proxy ${id}`,
}

describe('session filters', () => {
   it('should keep a clean address with nothing on, and read back what it wrote', () => {
      expect(writeFilters(NO_FILTERS)).toBeNull()

      const filters = {
         ...NO_FILTERS,
         results: ['FAILED' as const],
         tasks: ['linkedin-invite'],
         started: { from: '2026-10-30T00:00' },
      }
      const written = writeFilters(filters)

      expect(readFilters(new URLSearchParams({ filters: written ?? '' }))).toEqual(filters)
   })

   it('should still open the links from before (account and result), and drop a value that does not fit', () => {
      expect(readFilters(new URLSearchParams({ account: 'a1', result: 'FAILED' }))).toMatchObject({
         accounts: ['a1'],
         results: ['FAILED'],
      })
      expect(readFilters(new URLSearchParams({ filters: '{"results":["LOST"]}' }))).toEqual(NO_FILTERS)
      expect(readFilters(new URLSearchParams({ filters: 'not json' }))).toEqual(NO_FILTERS)
   })

   it('should ask brain only for what is on, with the owner’s own moments', () => {
      expect(apiFilters(NO_FILTERS)).toEqual({})
      expect(
         apiFilters({
            ...NO_FILTERS,
            q: 'ada',
            accounts: ['a1'],
            started: { from: '2026-10-30T09:15' },
            retries: 'RETRIED',
         })
      ).toEqual({
         search: 'ada',
         accountIds: ['a1'],
         startedFrom: new Date(2026, 9, 30, 9, 15),
         retries: 'RETRIED',
      })
   })

   it('should give one chip per filter that is on, named by the page, each clearing only itself', () => {
      const chips = chipsOf(
         {
            ...NO_FILTERS,
            accounts: ['a1', 'a2', 'a3'],
            verdicts: ['DONE'],
            has: ['VIDEO'],
         },
         names
      )

      expect(chips.map(({ text }) => text)).toEqual(['Account: acc a1, acc a2 +1', 'Verdict: done', 'Has: Video'])
      expect(chips[0]?.clear).toEqual({ accounts: [] })
   })
})
