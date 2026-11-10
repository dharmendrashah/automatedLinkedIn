import { describe, expect, it, vi } from 'vitest'

import { person } from 'core'

import { cutOf, rankNew, withoutSlugs } from './readLimit'

// core's index also loads services that read env; these pure helpers need none of it.
vi.mock('env', () => ({}))

const signal = (type: 'commented' | 'reacted' | 'employee', when: string | null) => ({
   type,
   via: 'post',
   at: when,
   excerpt: null,
})

const named = (slug: string, signals: ReturnType<typeof signal>[], enriched = false) =>
   person({
      slug,
      url: 'u',
      signals,
      enriched,
   })

describe('the read limit', () => {
   it('should rank commented before reacted before any other signal, newest first, ties by slug', () => {
      const people = [
         named('d', [signal('employee', '2026-11-01')]),
         named('c', [signal('reacted', '2026-11-02')]),
         named('b', [signal('commented', '2026-11-01')]),
         named('a', [signal('commented', '2026-11-03')]),
         named('e', [signal('commented', '2026-11-01')]),
      ]

      expect(rankNew(people).map(({ slug }) => slug)).toEqual(['a', 'b', 'e', 'c', 'd'])
   })

   it('should place a person by their best signal only, and a missing time last within its rank', () => {
      const people = [
         named('x', [signal('commented', '2026-11-01'), signal('reacted', '2026-11-09')]),
         named('y', [signal('commented', '2026-11-05')]),
         named('n', [signal('commented', null)]),
         named('m', [signal('commented', '2026-01-01')]),
      ]

      expect(rankNew(people).map(({ slug }) => slug)).toEqual(['y', 'x', 'm', 'n'])
   })

   it('should cut only the new people past the limit, never a person read before or enriched', () => {
      const people = [
         named('a', [signal('commented', '2026-11-03')]),
         named('b', [signal('commented', '2026-11-02')]),
         named('c', [signal('commented', '2026-11-01')]),
         named('r', [signal('commented', '2026-11-09')]),
         named('e', [signal('employee', '2026-01-01')], true),
      ]
      const cut = cutOf(people, new Set(['r']), 1)

      expect(cut.map(({ slug }) => slug)).toEqual(['b', 'c'])
      expect(
         withoutSlugs(
            people,
            cut.map(({ slug }) => slug)
         ).map(({ slug }) => slug)
      ).toEqual(['a', 'r', 'e'])
   })

   it('should cut nothing when the new people fit the limit', () => {
      const people = [named('a', [signal('commented', '2026-11-03')]), named('b', [signal('reacted', null)])]

      expect(cutOf(people, new Set(), 2)).toEqual([])
   })
})
