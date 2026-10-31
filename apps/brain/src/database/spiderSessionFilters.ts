import { type Prisma } from 'generated/prisma/client'

// What the Sessions page can narrow by (.plan/sessions-page.md). Every list is "any of"; an empty or missing one does not narrow.

export const SESSION_RESULTS = ['SUCCEEDED', 'FAILED', 'IN_PROGRESS', 'NO_ANSWER'] as const
export const SESSION_TRIGGERS = ['manual', 'automatic', 'retry'] as const
export const SESSION_TOOK = ['UNDER_1', 'FROM_1_TO_5', 'FROM_5_TO_15', 'OVER_15'] as const
export const SESSION_HAS = ['VIDEO', 'SCREENSHOTS', 'SESSION'] as const
export const SESSION_RETRIES = ['RETRIES', 'RETRIED'] as const

export type SessionFilters = {
   search?: string
   accountIds?: string[]
   results?: Array<(typeof SESSION_RESULTS)[number]>
   tasks?: string[]
   verdicts?: string[]
   triggers?: Array<(typeof SESSION_TRIGGERS)[number]>
   startedFrom?: Date
   startedTo?: Date
   took?: Array<(typeof SESSION_TOOK)[number]>
   proxyIds?: string[]
   proxyCountries?: string[]
   has?: Array<(typeof SESSION_HAS)[number]>
   retries?: (typeof SESSION_RETRIES)[number]
}

// A check not answered after the account lease would have run out shows as "No answer" (see SpiderSessionService).
export const NO_ANSWER_AFTER_MS = 30 * 60 * 1000

const MINUTE = 60_000

const TOOK_WHERE: Record<(typeof SESSION_TOOK)[number], Prisma.IntNullableFilter> = {
   UNDER_1: { lt: MINUTE },
   FROM_1_TO_5: {
      gte: MINUTE,
      lt: 5 * MINUTE,
   },
   FROM_5_TO_15: {
      gte: 5 * MINUTE,
      lt: 15 * MINUTE,
   },
   OVER_15: { gte: 15 * MINUTE },
}

const ARTIFACT_KIND: Record<(typeof SESSION_HAS)[number], string> = {
   VIDEO: 'video',
   SCREENSHOTS: 'screenshot',
   SESSION: 'session',
}

const resultWhere = (result: (typeof SESSION_RESULTS)[number], now: Date): Prisma.SpiderSessionWhereInput => {
   const cutoff = new Date(now.getTime() - NO_ANSWER_AFTER_MS)

   switch (result) {
      case 'IN_PROGRESS':
         return {
            status: 'IN_PROGRESS',
            startedAt: { gte: cutoff },
         }
      case 'NO_ANSWER':
         return {
            status: 'IN_PROGRESS',
            startedAt: { lt: cutoff },
         }
      default:
         return { status: result }
   }
}

const any = <T>(values: T[] | undefined, where: (value: T) => Prisma.SpiderSessionWhereInput) =>
   values && values.length > 0 ? [{ OR: values.map(where) }] : []

// The conditions of a filter set; `userId` always scopes it to the owner.
export const sessionWhere = (
   userId: string,
   filters: SessionFilters,
   now = new Date()
): Prisma.SpiderSessionWhereInput => {
   const search = filters.search?.trim()
   const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
   })

   return {
      userId,
      AND: [
         ...(filters.accountIds?.length ? [{ linkedInAccountId: { in: filters.accountIds } }] : []),
         ...any(filters.results, result => resultWhere(result, now)),
         ...(filters.tasks?.length ? [{ task: { in: filters.tasks } }] : []),
         ...(filters.verdicts?.length ? [{ verdict: { in: filters.verdicts } }] : []),
         ...(filters.triggers?.length ? [{ trigger: { in: filters.triggers } }] : []),
         ...(filters.startedFrom || filters.startedTo
            ? [
                 {
                    startedAt: {
                       ...(filters.startedFrom && { gte: filters.startedFrom }),
                       ...(filters.startedTo && { lte: filters.startedTo }),
                    },
                 },
              ]
            : []),
         ...any(filters.took, took => ({ durationMs: TOOK_WHERE[took] })),
         ...(filters.proxyIds?.length ? [{ proxyServerId: { in: filters.proxyIds } }] : []),
         ...(filters.proxyCountries?.length ? [{ proxyCountry: { in: filters.proxyCountries } }] : []),
         ...(filters.has ?? []).map(kind => ({ artifacts: { some: { kind: ARTIFACT_KIND[kind] } } })),
         ...(filters.retries === 'RETRIES' ? [{ retryOfId: { not: null } }] : []),
         ...(filters.retries === 'RETRIED' ? [{ retries: { some: {} } }] : []),
         ...(search
            ? [
                 {
                    OR: [
                       { id: search },
                       { task: contains(search) },
                       { verdict: contains(search) },
                       { message: contains(search) },
                       { linkedInAccount: { email: contains(search) } },
                       { linkedInAccount: { displayName: contains(search) } },
                    ],
                 },
              ]
            : []),
      ],
   }
}

// The same filters without one of them, so a facet counts what choosing another value of it would show.
export const without = (filters: SessionFilters, key: keyof SessionFilters): SessionFilters => {
   const { [key]: _dropped, ...rest } = filters

   return rest
}
