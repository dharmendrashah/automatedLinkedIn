import { type PersonItem, type Signal } from 'core'

// The order the read limit keeps people in: commented, then reacted, then any other signal.
const rankOf = (signal: Signal) => (signal.type === 'commented' ? 0 : signal.type === 'reacted' ? 1 : 2)

// Newer first; a missing time goes last. ISO strings compare as text.
const newerFirst = (a: string | null, b: string | null) => {
   if (a === b) {
      return 0
   }

   if (a === null) {
      return 1
   }

   if (b === null) {
      return -1
   }

   return a < b ? 1 : -1
}

// A person's place: the best rank of their signals, then the newest time among the signals of that rank.
const placeOf = ({ signals }: PersonItem) => {
   const rank = signals.length === 0 ? 2 : Math.min(...signals.map(rankOf))
   const at = signals
      .filter(signal => rankOf(signal) === rank)
      .reduce<string | null>(
         (latest, { at: when }) => (when !== null && (latest === null || when > latest) ? when : latest),
         null
      )

   return {
      rank,
      at,
   }
}

export const rankNew = (people: PersonItem[]) =>
   [...people].sort((a, b) => {
      const first = placeOf(a)
      const second = placeOf(b)

      return first.rank - second.rank || newerFirst(first.at, second.at) || a.slug.localeCompare(b.slug)
   })

// The new people past the limit, worst ranked last. A new person is one not read before and not enriched.
export const cutOf = (people: PersonItem[], reused: ReadonlySet<string>, limit: number) =>
   rankNew(people.filter(({ enriched, slug }) => !enriched && !reused.has(slug))).slice(limit)

export const withoutSlugs = (people: PersonItem[], slugs: string[]) => {
   const dropped = new Set(slugs)

   return people.filter(({ slug }) => !dropped.has(slug))
}
