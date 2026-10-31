import { Prisma } from 'generated/prisma/client'

// The Companies drawer's filters (.plan/companies-filter-drawer.md). Read data lives in `PageSnapshot.data`, so these run as one
// parameterised SQL query over the owner's companies and their reads; the list then keeps the ids it found.

export const TEAM_KIND_NAMES = ['department', 'skill', 'location', 'service', 'school', 'field'] as const
export type TeamKind = (typeof TEAM_KIND_NAMES)[number]

// The breakdowns of a read a team filter looks in; constants, so they are safe to put into the SQL text.
export const TEAM_KINDS: Record<TeamKind, string> = {
   department: 'byFunction',
   skill: 'bySkill',
   location: 'byLocation',
   service: 'byServiceCategory',
   school: 'bySchool',
   field: 'byFieldOfStudy',
}

export const READ_AGES = ['never', 'last7', 'last30', 'older30', 'older90'] as const
export const VISIT_AGES = ['never', 'last7', 'last30'] as const

type Range = { min?: number; max?: number }

export type CompanyFilters = {
   icpId?: string
   icpIncludeUnread?: boolean
   sizes?: string[]
   founded?: Range
   places?: string[]
   offices?: string[]
   categories?: string[]
   team?: Array<{ kind: TeamKind; values: string[]; min: number }>
   specialities?: string[]
   // All of the picked specialities (the default) or any of them.
   specialitiesMode?: 'all' | 'any'
   words?: { values: string[]; match: 'any' | 'all' }
   read?: (typeof READ_AGES)[number]
   visited?: (typeof VISIT_AGES)[number]
   notes?: string
   employees?: Range
   followers?: Range
   verified?: boolean
   active?: boolean
   showcase?: boolean
   hasWebsite?: boolean
   hasJobs?: boolean
}

// The company side of a saved ideal customer; titles and seniorities are about people and are not used here.
export type IcpRules = { industries: string[]; companySizes: string[]; locations: string[]; problemKeywords: string[] }

const DAY_MS = 24 * 60 * 60 * 1000

const lower = (values: string[]) => values.map(value => value.toLowerCase())
// `%` `_` and `\` match literally inside an ILIKE pattern.
export const likeOf = (value: string) => `%${value.replace(/[\\%_]/g, match => `\\${match}`)}%`
// "11 – 50" and "11-50" are the same band.
export const bandOf = (value: string) => value.replace(/[\s\u2013\u2014]/g, match => (match.trim() ? '-' : ''))
const bandSql = (expression: Prisma.Sql) =>
   Prisma.sql`REPLACE(REPLACE(REPLACE(${expression}, '\u2013', '-'), '\u2014', '-'), ' ', '')`

// Keys are always constants from this file, never input, so they go into the SQL text.
const field = (key: string) => Prisma.raw(`p."data"->>'${key}'`)
const isRead = Prisma.sql`p."id" IS NOT NULL`
const ofRead = (condition: Prisma.Sql) => Prisma.sql`(${isRead} AND ${condition})`
const both = (conditions: Prisma.Sql[]) => Prisma.join(conditions, ' AND ')
const either = (conditions: Prisma.Sql[]) => Prisma.sql`(${Prisma.join(conditions, ' OR ')})`
const anyLike = (expression: Prisma.Sql, values: string[]) =>
   either(values.map(value => Prisma.sql`${expression} ILIKE ${likeOf(value)}`))
const inList = (expression: Prisma.Sql, values: string[]) => Prisma.sql`LOWER(${expression}) = ANY(${lower(values)})`
const elements = (key: string) => Prisma.raw(`jsonb_array_elements(COALESCE(p."data"->'${key}', '[]'::jsonb))`)
const hasSpeciality = (values: string[]) =>
   Prisma.sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(p."data"->'specialities', '[]'::jsonb)) AS s WHERE ${inList(Prisma.sql`s`, values)})`

const range = (expression: Prisma.Sql, { min, max }: Range) => [
   ...(min === undefined ? [] : [ofRead(Prisma.sql`(${expression})::numeric >= ${min}`)]),
   ...(max === undefined ? [] : [ofRead(Prisma.sql`(${expression})::numeric <= ${max}`)]),
]

const flag = (key: string, value: boolean | undefined) =>
   value === undefined ? [] : [ofRead(Prisma.sql`COALESCE((${field(key)})::boolean, false) = ${value}`)]

// Tagline, about and specialities as one text, for words and ICP keywords.
const pageText = Prisma.sql`CONCAT_WS(' ', ${field('tagline')}, ${field('about')}, p."data"->>'specialities')`

const wordsSql = (values: string[], match: 'any' | 'all') => {
   const each = values.map(value => Prisma.sql`${pageText} ILIKE ${likeOf(value)}`)

   return ofRead(match === 'all' ? Prisma.sql`(${both(each)})` : either(each))
}

const placeText = Prisma.sql`CONCAT_WS(' ', c."location", c."country", p."data"->'address'->>'city', p."data"->'address'->>'state', p."data"->'address'->>'country', p."data"->>'locations')`

// Every company criterion the ICP sets must match; an unread company is unknown and shows only when asked for.
export const icpSql = (icp: IcpRules, includeUnread: boolean) => {
   const criteria = [
      ...(icp.industries.length > 0
         ? [
              either([
                 anyLike(Prisma.sql`c."industry"`, icp.industries),
                 anyLike(field('industryCategory'), icp.industries),
              ]),
           ]
         : []),
      ...(icp.companySizes.length > 0
         ? [
              Prisma.sql`${bandSql(Prisma.sql`COALESCE(${field('employeeRange')}, c."size")`)} = ANY(${icp.companySizes.map(bandOf)})`,
           ]
         : []),
      ...(icp.locations.length > 0 ? [anyLike(placeText, icp.locations)] : []),
      ...(icp.problemKeywords.length > 0 ? [anyLike(pageText, icp.problemKeywords)] : []),
   ]

   if (criteria.length === 0) {
      return []
   }

   const matched = Prisma.sql`(${isRead} AND ${both(criteria)})`

   return [includeUnread ? Prisma.sql`(p."id" IS NULL OR ${matched})` : matched]
}

const readSql = (read: CompanyFilters['read'], now: Date) => {
   const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS)

   switch (read) {
      case 'never':
         return [Prisma.sql`p."id" IS NULL`]
      case 'last7':
         return [Prisma.sql`p."fetchedAt" >= ${daysAgo(7)}`]
      case 'last30':
         return [Prisma.sql`p."fetchedAt" >= ${daysAgo(30)}`]
      case 'older30':
         return [Prisma.sql`p."fetchedAt" < ${daysAgo(30)}`]
      case 'older90':
         return [Prisma.sql`p."fetchedAt" < ${daysAgo(90)}`]
      default:
         return []
   }
}

// The SQL conditions of the filters that need the read or a raw match; empty when none is set.
export const filterSql = (filters: CompanyFilters, now: Date) => [
   ...(filters.sizes?.length
      ? [
           Prisma.sql`${bandSql(Prisma.sql`COALESCE(${field('employeeRange')}, c."size")`)} = ANY(${filters.sizes.map(bandOf)})`,
        ]
      : []),
   ...range(field('founded'), filters.founded ?? {}),
   ...(filters.places?.length
      ? [
           ofRead(
              either([
                 inList(Prisma.sql`p."data"->'address'->>'city'`, filters.places),
                 inList(Prisma.sql`p."data"->'address'->>'state'`, filters.places),
              ])
           ),
        ]
      : []),
   ...(filters.offices?.length
      ? [
           ofRead(
              Prisma.sql`EXISTS (SELECT 1 FROM ${elements('locations')} AS o WHERE ${inList(Prisma.sql`o->>'city'`, filters.offices)})`
           ),
        ]
      : []),
   ...(filters.categories?.length ? [ofRead(inList(field('industryCategory'), filters.categories))] : []),
   ...(filters.team ?? []).map(({ kind, values, min }) =>
      ofRead(
         Prisma.sql`EXISTS (SELECT 1 FROM ${elements(TEAM_KINDS[kind])} AS e WHERE ${inList(Prisma.sql`e->>'label'`, values)} AND (e->>'count')::numeric >= ${min})`
      )
   ),
   ...(filters.specialities?.length
      ? [
           ofRead(
              filters.specialitiesMode === 'any'
                 ? hasSpeciality(filters.specialities)
                 : both(filters.specialities.map(speciality => hasSpeciality([speciality])))
           ),
        ]
      : []),
   ...(filters.words?.values.length ? [wordsSql(filters.words.values, filters.words.match)] : []),
   ...readSql(filters.read, now),
   ...(filters.notes ? [Prisma.sql`c."notes" ILIKE ${likeOf(filters.notes)}`] : []),
   ...range(field('employees'), filters.employees ?? {}),
   ...range(field('followers'), filters.followers ?? {}),
   ...flag('verified', filters.verified),
   ...flag('active', filters.active),
   ...flag('showcase', filters.showcase),
   ...(filters.hasWebsite === undefined
      ? []
      : [Prisma.sql`(COALESCE(${field('website')}, c."website") IS NOT NULL) = ${filters.hasWebsite}`]),
   ...(filters.hasJobs === undefined
      ? []
      : [ofRead(Prisma.sql`(${field('jobsUrl')} IS NOT NULL) = ${filters.hasJobs}`)]),
]

// The owner's company ids that pass the conditions, joined with their company read when there is one.
export const companyIdsSql = (userId: string, conditions: Prisma.Sql[]) => Prisma.sql`
   SELECT c."id" FROM "LinkedInCompany" AS c
   LEFT JOIN "PageSnapshot" AS p ON p."userId" = c."userId" AND p."slug" = c."slug" AND p."kind" = 'COMPANY'
   WHERE c."userId" = ${userId} AND ${both(conditions)}`

// Visits are a relation, so they stay a Prisma filter.
export const visitedWhere = (visited: CompanyFilters['visited'], now: Date) => {
   const counted = { status: { in: ['ASKED' as const, 'DONE' as const] } }

   switch (visited) {
      case 'never':
         return { visits: { none: counted } }
      case 'last7':
      case 'last30':
         return {
            visits: {
               some: {
                  ...counted,
                  createdAt: { gte: new Date(now.getTime() - (visited === 'last7' ? 7 : 30) * DAY_MS) },
               },
            },
         }
      default:
         return {}
   }
}
