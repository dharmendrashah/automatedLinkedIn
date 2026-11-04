import { type PersonSnapshotData, profileFacts } from './personSnapshot'

// "Find the pattern" and "Detect changes" (.plan/lead-pipeline-p8-reading-blocks.md): rules only, from the stored profile reads.

export const PATTERN_PARTS = ['titles', 'companies', 'schools', 'skills', 'sizes', 'industries', 'places'] as const

export type PatternPart = (typeof PATTERN_PARTS)[number]

// Below this many full profiles a pattern is chance.
export const PATTERN_MIN = 5

export type PatternPerson = {
   snapshot: PersonSnapshotData | null
   companySize: string | null
   companyIndustry: string | null
}

export type Count = { value: string; count: number; share: number }

export type Pattern = {
   people: number
   // People whose full profile is stored; the rest are left out of the profile parts.
   read: number
   parts: Partial<Record<PatternPart, Count[]>>
}

const valuesOf = (part: PatternPart, { snapshot, companySize, companyIndustry }: PatternPerson): string[] => {
   if (part === 'sizes') {
      return companySize ? [companySize] : []
   }

   if (part === 'industries') {
      return companyIndustry ? [companyIndustry] : []
   }

   if (!snapshot) {
      return []
   }

   const facts = profileFacts(snapshot)
   const values: Array<string | null> =
      part === 'titles'
         ? [facts.title]
         : part === 'companies'
           ? [facts.company]
           : part === 'schools'
             ? snapshot.education.map(({ school }) => school)
             : part === 'skills'
               ? snapshot.skills
               : [facts.country]

   return values.flatMap(value => value?.trim() || [])
}

// The most common values of each part, once per person, with the share of the people who have the part at all.
export const findPattern = (people: PatternPerson[], parts: readonly PatternPart[], top: number): Pattern => {
   const found: Pattern['parts'] = {}

   for (const part of parts) {
      const counts = new Map<string, { value: string; count: number }>()
      let known = 0

      for (const person of people) {
         const values = [...new Map(valuesOf(part, person).map(value => [value.toLowerCase(), value])).entries()]

         known += values.length > 0 ? 1 : 0

         for (const [key, value] of values) {
            counts.set(key, {
               value: counts.get(key)?.value ?? value,
               count: (counts.get(key)?.count ?? 0) + 1,
            })
         }
      }

      found[part] = [...counts.values()]
         .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
         .slice(0, top)
         .map(({ value, count }) => ({
            value,
            count,
            share: Math.round((count / known) * 100),
         }))
   }

   return {
      people: people.length,
      read: people.filter(({ snapshot }) => snapshot !== null).length,
      parts: found,
   }
}

const MONTH_YEAR = /^(\d{1,2})\/(\d{4})$/
const YEAR_MONTH = /^(\d{4})-(\d{2})(?:-(\d{2}))?/
const YEAR = /^\d{4}$/

// When a position started, from the text of a read: "3/2026", "2026-03-01", "2026" (read as 1 January) or any date JavaScript can read.
export const startOf = (text: string | null): Date | null => {
   const value = text?.trim() ?? ''
   const monthYear = MONTH_YEAR.exec(value)
   const yearMonth = YEAR_MONTH.exec(value)
   const date = monthYear
      ? new Date(Date.UTC(Number(monthYear[2]), Number(monthYear[1]) - 1, 1))
      : yearMonth
        ? new Date(Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, Number(yearMonth[3] ?? 1)))
        : YEAR.test(value)
          ? new Date(Date.UTC(Number(value), 0, 1))
          : new Date(value)

   return value === '' || Number.isNaN(date.getTime()) ? null : date
}

const DAY_MS = 24 * 60 * 60 * 1000

export type RoleChange = { role: string | null; since: string }

// The newest position that has not ended and started inside the window. A start in the future is a mistake and counts for nothing.
export const newRoleOf = (snapshot: PersonSnapshotData, withinDays: number, now = new Date()): RoleChange | null => {
   const starts = snapshot.experience.flatMap(({ title, start, end }) => {
      const date = end === null ? startOf(start) : null

      return date && date <= now && now.getTime() - date.getTime() <= withinDays * DAY_MS
         ? [
              {
                 title,
                 date,
              },
           ]
         : []
   })
   const [newest] = starts.sort((a, b) => b.date.getTime() - a.date.getTime())

   return newest
      ? {
           role: newest.title,
           since: newest.date.toISOString().slice(0, 10),
        }
      : null
}
