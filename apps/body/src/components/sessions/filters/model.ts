// The Sessions page's filters (.plan/sessions-page.md), kept in the address as one JSON value like My network's. Dates are the
// owner's own day and time until they are sent.
import { z } from 'zod'

import { type RouterInputs } from '../../../trpc'
import { type DateRange, fromLocal, rangeText } from '../../my-network/filters/model'

export const RESULTS = ['SUCCEEDED', 'FAILED', 'IN_PROGRESS', 'NO_ANSWER'] as const
export const TRIGGERS = ['manual', 'automatic', 'retry'] as const
export const TOOK = ['UNDER_1', 'FROM_1_TO_5', 'FROM_5_TO_15', 'OVER_15'] as const
export const HAS = ['VIDEO', 'SCREENSHOTS', 'SESSION'] as const
export const RETRIES = ['RETRIES', 'RETRIED'] as const

export const RESULT_WORDS: Record<(typeof RESULTS)[number], string> = {
   SUCCEEDED: 'Success',
   FAILED: 'Failed',
   IN_PROGRESS: 'In progress',
   NO_ANSWER: 'No answer',
}

export const TRIGGER_WORDS: Record<(typeof TRIGGERS)[number], string> = {
   manual: 'By hand',
   automatic: 'Automatically',
   retry: 'Retry',
}

export const TOOK_WORDS: Record<(typeof TOOK)[number], string> = {
   UNDER_1: 'Under 1 min',
   FROM_1_TO_5: '1–5 min',
   FROM_5_TO_15: '5–15 min',
   OVER_15: 'Over 15 min',
}

export const HAS_WORDS: Record<(typeof HAS)[number], string> = {
   VIDEO: 'Video',
   SCREENSHOTS: 'Screenshots',
   SESSION: 'Saved session',
}

export const RETRIES_WORDS: Record<(typeof RETRIES)[number], string> = {
   RETRIES: 'Only retries',
   RETRIED: 'Only retried runs',
}

const MAX = 50
const id = z.string().min(1).max(100)
const word = z.string().min(1).max(120)
const values = <T extends z.ZodType>(value: T) => z.array(value).max(MAX).default([])
const moment = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

const filtersSchema = z.strictObject({
   q: z.string().trim().max(200).optional(),
   accounts: values(id),
   results: values(z.enum(RESULTS)),
   tasks: values(word),
   verdicts: values(word),
   triggers: values(z.enum(TRIGGERS)),
   started: z
      .strictObject({
         from: moment.optional(),
         to: moment.optional(),
      })
      .default({}),
   took: values(z.enum(TOOK)),
   proxies: values(id),
   countries: values(word),
   has: values(z.enum(HAS)),
   retries: z.enum(RETRIES).optional(),
})

export type SessionFilters = z.output<typeof filtersSchema>
type ApiFilters = Omit<RouterInputs['session']['list'], 'sort' | 'cursor'>

export const NO_FILTERS: SessionFilters = filtersSchema.parse({})

const LEGACY_RESULTS: Record<string, (typeof RESULTS)[number]> = {
   SUCCEEDED: 'SUCCEEDED',
   FAILED: 'FAILED',
   IN_PROGRESS: 'IN_PROGRESS',
}

// The `filters` value of the address; links from before it (`?account=` and `?result=`) still open what they named.
export const readFilters = (params: URLSearchParams): SessionFilters => {
   const legacyAccount = params.get('account')
   const legacyResult = LEGACY_RESULTS[params.get('result') ?? '']
   let read = NO_FILTERS

   try {
      read = filtersSchema.safeParse(JSON.parse(params.get('filters') ?? '{}')).data ?? NO_FILTERS
   } catch {
      read = NO_FILTERS
   }

   return {
      ...read,
      ...(legacyAccount && legacyAccount !== 'all' && { accounts: [legacyAccount] }),
      ...(legacyResult && { results: [legacyResult] }),
   }
}

// Only what is on is written, so an untouched page keeps a clean address.
export const writeFilters = (filters: SessionFilters) => {
   const empty = new Map(Object.entries(NO_FILTERS).map(([key, value]) => [key, JSON.stringify(value)]))
   const on = Object.fromEntries(
      Object.entries(filters).filter(
         ([key, value]) => value !== undefined && value !== '' && JSON.stringify(value) !== empty.get(key)
      )
   )

   return Object.keys(on).length > 0 ? JSON.stringify(on) : null
}

const list = <T>(values: T[]) => (values.length > 0 ? values : undefined)

// A fixed list of values as picker options, with how many sessions each has when the counts are known.
export const fixed = <V extends string>(values: readonly V[], words: Record<V, string>, hints?: Map<string, number>) =>
   values.map(value => ({
      value,
      label: words[value],
      hint: hints ? String(hints.get(value) ?? 0) : undefined,
   }))

// The picked values that belong to a fixed list, typed as it.
export const only = <V extends string>(values: readonly V[], picked: string[]) =>
   values.filter(value => picked.includes(value))

// What brain is asked: the same filters with real moments and nothing that is off.
export const apiFilters = (filters: SessionFilters): ApiFilters => {
   const from = fromLocal(filters.started.from)
   const to = fromLocal(filters.started.to)

   return {
      ...(filters.q && { search: filters.q }),
      ...(list(filters.accounts) && { accountIds: filters.accounts }),
      ...(list(filters.results) && { results: filters.results }),
      ...(list(filters.tasks) && { tasks: filters.tasks }),
      ...(list(filters.verdicts) && { verdicts: filters.verdicts }),
      ...(list(filters.triggers) && { triggers: filters.triggers }),
      ...(from && { startedFrom: from }),
      ...(to && { startedTo: to }),
      ...(list(filters.took) && { took: filters.took }),
      ...(list(filters.proxies) && { proxyIds: filters.proxies }),
      ...(list(filters.countries) && { proxyCountries: filters.countries }),
      ...(list(filters.has) && { has: filters.has }),
      ...(filters.retries && { retries: filters.retries }),
   }
}

export type Chip = { key: string; text: string; clear: Partial<SessionFilters> }

type Names = {
   account: (id: string) => string
   task: (task: string) => string
   verdict: (verdict: string) => string
   proxy: (id: string) => string
}

const listText = (values: string[], max = 2) =>
   values.length > max ? `${values.slice(0, max).join(', ')} +${values.length - max}` : values.join(', ')

// One removable chip per filter that is on, in the order of the drawer; the search box shows its own words.
export const chipsOf = (filters: SessionFilters, names: Names): Chip[] => {
   const chip = (key: keyof SessionFilters, label: string, text: string): Chip => ({
      key,
      text: `${label}: ${text}`,
      clear: { [key]: NO_FILTERS[key] },
   })
   const range: DateRange = filters.started

   return [
      ...(filters.accounts.length ? [chip('accounts', 'Account', listText(filters.accounts.map(names.account)))] : []),
      ...(filters.results.length
         ? [chip('results', 'Result', listText(filters.results.map(value => RESULT_WORDS[value])))]
         : []),
      ...(filters.tasks.length ? [chip('tasks', 'Action', listText(filters.tasks.map(names.task)))] : []),
      ...(filters.verdicts.length ? [chip('verdicts', 'Verdict', listText(filters.verdicts.map(names.verdict)))] : []),
      ...(filters.triggers.length
         ? [chip('triggers', 'Started', listText(filters.triggers.map(value => TRIGGER_WORDS[value])))]
         : []),
      ...(range.from || range.to ? [chip('started', 'When', rangeText(range))] : []),
      ...(filters.took.length ? [chip('took', 'Took', listText(filters.took.map(value => TOOK_WORDS[value])))] : []),
      ...(filters.proxies.length ? [chip('proxies', 'Proxy', listText(filters.proxies.map(names.proxy)))] : []),
      ...(filters.countries.length ? [chip('countries', 'Proxy country', listText(filters.countries))] : []),
      ...(filters.has.length ? [chip('has', 'Has', listText(filters.has.map(value => HAS_WORDS[value])))] : []),
      ...(filters.retries ? [chip('retries', 'Retries', RETRIES_WORDS[filters.retries])] : []),
   ]
}
