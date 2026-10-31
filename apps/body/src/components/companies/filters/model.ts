// The Companies drawer's filters (.plan/companies-filter-drawer.md), kept in the address as one JSON value like Sessions'.
import { z } from 'zod'

import { type LinkStatus } from '../../links/types'

import { type RouterInputs } from '../../../trpc'
import { type AddedFilter } from '../../labels/added'
import { type LabelMatch } from '../../links/use-list-state'

// The list's own filters, which the drawer edits too; they live in the list state and the address, not in `filters`.
export type Basics = {
   status: LinkStatus | 'all'
   added: AddedFilter
   tags: string[]
   tagMatch: LabelMatch
   includeArchived: boolean
   industries: string[]
   countries: string[]
}

export const NO_BASICS: Basics = {
   status: 'all',
   added: 'any',
   tags: [],
   tagMatch: 'any',
   includeArchived: false,
   industries: [],
   countries: [],
}

export const TEAM_KINDS = ['department', 'skill', 'location', 'service'] as const
export const READ_AGES = ['never', 'last7', 'last30', 'older30', 'older90'] as const
export const VISIT_AGES = ['never', 'last7', 'last30'] as const

export const TEAM_WORDS: Record<(typeof TEAM_KINDS)[number], string> = {
   department: 'in department',
   skill: 'with skill',
   location: 'based in',
   service: 'offering service',
}

export const READ_WORDS: Record<(typeof READ_AGES)[number], string> = {
   never: 'Never read',
   last7: 'Read in the last 7 days',
   last30: 'Read in the last 30 days',
   older30: 'Read over 30 days ago',
   older90: 'Read over 90 days ago',
}

export const VISIT_WORDS: Record<(typeof VISIT_AGES)[number], string> = {
   never: 'Never visited',
   last7: 'Visited in the last 7 days',
   last30: 'Visited in the last 30 days',
}

const MAX = 50
const word = z.string().trim().min(1).max(200)
const values = z.array(word).max(MAX).default([])
const amount = z.number().int().min(0).max(10_000_000)
const range = z
   .strictObject({
      min: amount.optional(),
      max: amount.optional(),
   })
   .default({})

const filtersSchema = z.strictObject({
   icpId: z.string().min(1).max(100).optional(),
   icpIncludeUnread: z.boolean().default(false),
   sizes: values,
   founded: range,
   places: values,
   offices: values,
   categories: values,
   team: z
      .array(
         z.strictObject({
            kind: z.enum(TEAM_KINDS),
            values: z.array(word).max(MAX),
            min: z.number().int().min(1).max(100_000),
         })
      )
      .max(5)
      .default([]),
   specialities: values,
   // Comma-separated words looked for in the tagline, about and specialities.
   words: z.string().trim().max(300).default(''),
   wordsMatch: z.enum(['any', 'all']).default('any'),
   read: z.enum(READ_AGES).optional(),
   visited: z.enum(VISIT_AGES).optional(),
   notes: z.string().trim().max(200).default(''),
   employees: range,
   followers: range,
   verified: z.boolean().optional(),
   active: z.boolean().optional(),
   showcase: z.boolean().optional(),
   hasWebsite: z.boolean().optional(),
   hasJobs: z.boolean().optional(),
   schools: values,
   fields: values,
})

export type CompanyFilters = z.output<typeof filtersSchema>
export type TeamRule = CompanyFilters['team'][number]
type Range = CompanyFilters['founded']
type ApiFilters = Omit<
   RouterInputs['linkedInCompany']['count'],
   'search' | 'status' | 'tags' | 'tagMatch' | 'addedSince' | 'includeArchived' | 'industries' | 'countries'
>

export const NO_FILTERS: CompanyFilters = filtersSchema.parse({})

// The `filters` value of the address; one that does not parse is ignored.
export const readFilters = (value: string | null): CompanyFilters => {
   try {
      return filtersSchema.safeParse(JSON.parse(value ?? '{}')).data ?? NO_FILTERS
   } catch {
      return NO_FILTERS
   }
}

// Only what is on is written, so an untouched page keeps a clean address.
export const writeFilters = (filters: CompanyFilters) => {
   const empty = new Map(Object.entries(NO_FILTERS).map(([key, value]) => [key, JSON.stringify(value)]))
   const on = Object.fromEntries(
      Object.entries(filters).filter(([key, value]) => value !== undefined && JSON.stringify(value) !== empty.get(key))
   )

   return Object.keys(on).length > 0 ? JSON.stringify(on) : null
}

export const wordsOf = (text: string) =>
   text
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

const rangeOf = ({ min, max }: Range) =>
   min === undefined && max === undefined
      ? undefined
      : {
           ...(min === undefined ? {} : { min }),
           ...(max === undefined ? {} : { max }),
        }

const list = (items: string[]) => (items.length > 0 ? items : undefined)

// What brain is asked: schools and fields of study are team rules with at least one person.
export const apiFilters = (filters: CompanyFilters): ApiFilters => {
   const words = wordsOf(filters.words)
   const team = [
      ...filters.team.filter(rule => rule.values.length > 0),
      ...(filters.schools.length > 0
         ? [
              {
                 kind: 'school' as const,
                 values: filters.schools,
                 min: 1,
              },
           ]
         : []),
      ...(filters.fields.length > 0
         ? [
              {
                 kind: 'field' as const,
                 values: filters.fields,
                 min: 1,
              },
           ]
         : []),
   ]
   const founded = rangeOf(filters.founded)
   const employees = rangeOf(filters.employees)
   const followers = rangeOf(filters.followers)

   return {
      ...(filters.icpId && {
         icpId: filters.icpId,
         icpIncludeUnread: filters.icpIncludeUnread,
      }),
      ...(list(filters.sizes) && { sizes: filters.sizes }),
      ...(founded && { founded }),
      ...(list(filters.places) && { places: filters.places }),
      ...(list(filters.offices) && { offices: filters.offices }),
      ...(list(filters.categories) && { categories: filters.categories }),
      ...(team.length > 0 && { team }),
      ...(list(filters.specialities) && { specialities: filters.specialities }),
      ...(words.length > 0 && {
         words: {
            values: words,
            match: filters.wordsMatch,
         },
      }),
      ...(filters.read && { read: filters.read }),
      ...(filters.visited && { visited: filters.visited }),
      ...(filters.notes && { notes: filters.notes }),
      ...(employees && { employees }),
      ...(followers && { followers }),
      ...(filters.verified !== undefined && { verified: filters.verified }),
      ...(filters.active !== undefined && { active: filters.active }),
      ...(filters.showcase !== undefined && { showcase: filters.showcase }),
      ...(filters.hasWebsite !== undefined && { hasWebsite: filters.hasWebsite }),
      ...(filters.hasJobs !== undefined && { hasJobs: filters.hasJobs }),
   }
}

export type Chip = { key: string; text: string; clear: Partial<CompanyFilters> }

const listText = (items: string[], max = 2) =>
   items.length > max ? `${items.slice(0, max).join(', ')} +${items.length - max}` : items.join(', ')

const rangeText = ({ min, max }: Range) =>
   min !== undefined && max !== undefined
      ? `${min.toLocaleString()}\u2013${max.toLocaleString()}`
      : min !== undefined
        ? `${min.toLocaleString()} or more`
        : `up to ${(max ?? 0).toLocaleString()}`

const yesNo = (value: boolean, yes: string, no: string) => (value ? yes : no)

// One removable chip per filter that is on, in the order of the drawer.
export const chipsOf = (filters: CompanyFilters, icpName: (id: string) => string): Chip[] => {
   const chip = (key: keyof CompanyFilters, text: string): Chip => ({
      key,
      text,
      clear: { [key]: NO_FILTERS[key] },
   })
   const on = (value: Range) => value.min !== undefined || value.max !== undefined
   const flags: Array<[keyof CompanyFilters, boolean | undefined, string, string]> = [
      ['verified', filters.verified, 'Verified', 'Not verified'],
      ['active', filters.active, 'Active page', 'Inactive page'],
      ['showcase', filters.showcase, 'Showcase page', 'Not a showcase page'],
      ['hasWebsite', filters.hasWebsite, 'Has a website', 'No website'],
      ['hasJobs', filters.hasJobs, 'Has a jobs link', 'No jobs link'],
   ]

   return [
      ...(filters.icpId
         ? [
              {
                 key: 'icpId',
                 text: `Matches ICP: ${icpName(filters.icpId)}${filters.icpIncludeUnread ? ' (and unread)' : ''}`,
                 clear: {
                    icpId: undefined,
                    icpIncludeUnread: false,
                 },
              },
           ]
         : []),
      ...(filters.sizes.length ? [chip('sizes', `Size: ${listText(filters.sizes)}`)] : []),
      ...(on(filters.founded) ? [chip('founded', `Founded: ${rangeText(filters.founded).replace(/,/g, '')}`)] : []),
      ...(filters.places.length ? [chip('places', `HQ in: ${listText(filters.places)}`)] : []),
      ...(filters.offices.length ? [chip('offices', `Office in: ${listText(filters.offices)}`)] : []),
      ...(filters.categories.length ? [chip('categories', `Category: ${listText(filters.categories)}`)] : []),
      ...filters.team.flatMap((rule, index) =>
         rule.values.length
            ? [
                 {
                    key: `team-${index}`,
                    text: `At least ${rule.min} ${TEAM_WORDS[rule.kind]} ${listText(rule.values)}`,
                    clear: { team: filters.team.filter((_, other) => other !== index) },
                 },
              ]
            : []
      ),
      ...(filters.specialities.length ? [chip('specialities', `Speciality: ${listText(filters.specialities)}`)] : []),
      ...(wordsOf(filters.words).length
         ? [
              chip(
                 'words',
                 `Says ${listText(wordsOf(filters.words))}${filters.wordsMatch === 'all' && wordsOf(filters.words).length > 1 ? ' (all)' : ''}`
              ),
           ]
         : []),
      ...(filters.read ? [chip('read', READ_WORDS[filters.read])] : []),
      ...(filters.visited ? [chip('visited', VISIT_WORDS[filters.visited])] : []),
      ...(filters.notes ? [chip('notes', `Notes: ${filters.notes}`)] : []),
      ...(on(filters.employees) ? [chip('employees', `On LinkedIn: ${rangeText(filters.employees)}`)] : []),
      ...(on(filters.followers) ? [chip('followers', `Followers: ${rangeText(filters.followers)}`)] : []),
      ...flags.flatMap(([key, value, yes, no]) => (value === undefined ? [] : [chip(key, yesNo(value, yes, no))])),
      ...(filters.schools.length ? [chip('schools', `School: ${listText(filters.schools)}`)] : []),
      ...(filters.fields.length ? [chip('fields', `Studied: ${listText(filters.fields)}`)] : []),
   ]
}
