import { describe, expect, it } from 'vitest'

import { byCell, entriesOf, startOfWeek, weekDays } from './week'

const post = (over: Record<string, unknown>) => ({
   id: 'p',
   accountId: 'a1',
   state: 'SCHEDULED' as const,
   words: 'Words',
   scheduledAt: null,
   postedAt: null,
   createdAt: '2026-10-20T10:00:00',
   ...over,
})

describe('startOfWeek and weekDays', () => {
   it('should start on the Monday of the week, or of a week away', () => {
      const wednesday = new Date(2026, 9, 28, 15, 30)

      expect(startOfWeek(wednesday)).toEqual(new Date(2026, 9, 26))
      expect(startOfWeek(new Date(2026, 10, 1, 23, 59))).toEqual(new Date(2026, 9, 26))
      expect(startOfWeek(wednesday, 1)).toEqual(new Date(2026, 10, 2))
      expect(startOfWeek(wednesday, -1)).toEqual(new Date(2026, 9, 19))
   })

   it('should give seven calendar days', () => {
      const days = weekDays(new Date(2026, 9, 26))

      expect(days).toHaveLength(7)
      expect(days[6]).toEqual(new Date(2026, 10, 1))
   })
})

describe('entriesOf', () => {
   it('should date a post by when it went, else when it was to start, else when it was sent, and add planned drafts only', () => {
      const entries = entriesOf(
         [
            post({ id: 'a', state: 'POSTED', postedAt: '2026-10-27T09:00:00' }),
            post({ id: 'b', scheduledAt: '2026-10-29T09:00:00' }),
            post({ id: 'c', state: 'FAILED' }),
         ],
         [
            { id: 'd1', accountId: 'a1', plannedAt: '2026-10-30T09:00:00', words: 'Draft' },
            { id: 'd2', accountId: 'a1', plannedAt: null, words: 'Not planned' },
         ]
      )

      expect(entries.map(({ id, kind, at }) => [id, kind, at.getTime()])).toEqual([
         ['a', 'posted', new Date('2026-10-27T09:00:00').getTime()],
         ['b', 'planned', new Date('2026-10-29T09:00:00').getTime()],
         ['c', 'failed', new Date('2026-10-20T10:00:00').getTime()],
         ['d1', 'draft', new Date('2026-10-30T09:00:00').getTime()],
      ])
   })
})

describe('byCell', () => {
   const start = new Date(2026, 9, 26)
   const entry = (id: string, accountId: string, at: Date) => ({
      id,
      accountId,
      at,
      kind: 'planned' as const,
      text: id,
   })

   it('should place each entry under its account and day, in time order, and drop the ones outside the week', () => {
      const cells = byCell(
         [
            entry('late', 'a1', new Date(2026, 9, 26, 17)),
            entry('early', 'a1', new Date(2026, 9, 26, 8)),
            entry('sunday', 'a2', new Date(2026, 10, 1, 23, 59)),
            entry('before', 'a1', new Date(2026, 9, 25, 23, 59)),
            entry('after', 'a1', new Date(2026, 10, 2, 0, 0)),
         ],
         start
      )

      expect(cells.get('a1|0')?.map(({ id }) => id)).toEqual(['early', 'late'])
      expect(cells.get('a2|6')?.map(({ id }) => id)).toEqual(['sunday'])
      expect(cells.size).toBe(2)
   })
})
