// The filters of My network beyond the toolbar's Found by, Fit and Label (.plan/network-filters.md): a copy of brain's
// `peopleFiltersSchema` (contracts are not bundled into the page) with the owner's own day and time for dates until they are
// sent. `model.unit.test.ts` keeps the two equal.
import { endOfDay, format, parse, startOfDay, startOfMonth, subDays } from 'date-fns'
import { z } from 'zod'

import { type RouterInputs } from '../../../trpc'
import { statusWord } from '../words'

export const FILTER_LIMITS = {
   text: 100,
   values: 20,
} as const

export const INVITE_STATES = ['NONE', 'QUEUED', 'PENDING', 'ACCEPTED', 'ENDED'] as const

const text = z.string().trim().min(1).max(FILTER_LIMITS.text)
const values = <T extends z.ZodType>(value: T) => z.array(value).max(FILTER_LIMITS.values).default([])
const moment = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
const localRange = z
   .strictObject({
      from: moment.optional(),
      to: moment.optional(),
   })
   .default({})
   .refine(({ from, to }) => !from || !to || from <= to)

export const filtersSchema = z
   .strictObject({
      name: text.optional(),
      companies: values(text),
      title: text.optional(),
      countries: values(text),
      skills: values(text),
      skillsMode: z.enum(['all', 'any']).default('all'),
      premium: z.boolean().optional(),
      connection: z.enum(['CONNECTED', 'NOT_CONNECTED', 'DISCOVERY']).optional(),
      connectedTo: z.string().min(1).max(100).optional(),
      connectedAt: localRange,
      invites: values(z.enum(INVITE_STATES)),
      lastSent: localRange,
      lastReceived: localRange,
      neverMessaged: z.boolean().default(false),
      replyWaiting: z.boolean().default(false),
      lastTouch: localRange,
      firstSeen: localRange,
      labels: values(text.toLowerCase()),
      labelsMode: z.enum(['any', 'all']).default('any'),
      noLabels: z.boolean().default(false),
      statuses: values(z.enum(['NEW', 'CONTACTED', 'REPLIED', 'NOT_INTERESTED', 'DONE'])),
      profileRead: z.boolean().optional(),
   })
   .refine(
      filters =>
         filters.connection === 'CONNECTED' ||
         (!filters.connectedAt.from && !filters.connectedAt.to && !filters.connectedTo)
   )

type ApiFilters = NonNullable<RouterInputs['people']['list']['filters']>

export type DateRange = z.output<typeof localRange>
export type PeopleFilters = z.output<typeof filtersSchema>
export type InviteState = (typeof INVITE_STATES)[number]

export const NO_FILTERS: PeopleFilters = filtersSchema.parse({})

export const INVITE_WORDS: Record<InviteState, string> = {
   NONE: 'Not invited',
   QUEUED: 'Queued',
   PENDING: 'Pending',
   ACCEPTED: 'Accepted',
   ENDED: 'Withdrawn or ended',
}

export const RANGE_KEYS = ['connectedAt', 'lastSent', 'lastReceived', 'lastTouch', 'firstSeen'] as const

export type RangeKey = (typeof RANGE_KEYS)[number]

export const RANGE_WORDS: Record<RangeKey, string> = {
   connectedAt: 'Connected',
   lastSent: 'Last message from you',
   lastReceived: 'Last reply from them',
   lastTouch: 'Last touch',
   firstSeen: 'First seen',
}

// A moment in the owner's own time, as `yyyy-MM-ddTHH:mm`; brain gets it as an exact instant.
export const LOCAL = "yyyy-MM-dd'T'HH:mm"

export const local = (date: Date) => format(date, LOCAL)
export const fromLocal = (value: string | undefined) => (value ? parse(value, LOCAL, new Date()) : undefined)

const days = (from: Date, to: Date): DateRange => ({
   from: local(startOfDay(from)),
   to: local(endOfDay(to)),
})

// Quick choices for a date filter: whole days, ending today.
export const QUICK_RANGES = [
   ['Today', (now: Date) => days(now, now)],
   ['Yesterday', (now: Date) => days(subDays(now, 1), subDays(now, 1))],
   ['Last 7 days', (now: Date) => days(subDays(now, 6), now)],
   ['Last 30 days', (now: Date) => days(subDays(now, 29), now)],
   ['Last 90 days', (now: Date) => days(subDays(now, 89), now)],
   ['This month', (now: Date) => days(startOfMonth(now), now)],
] as const

// "3 Oct 2026", with the time only when it is not the start or end of the day.
const momentText = (value: string, end: boolean) => {
   const date = parse(value, LOCAL, new Date())
   const whole = end ? format(date, 'HH:mm') === '23:59' : format(date, 'HH:mm') === '00:00'

   return format(date, whole ? 'd MMM yyyy' : 'd MMM yyyy, HH:mm')
}

export const rangeText = ({ from, to }: DateRange) => {
   const start = from ? momentText(from, false) : ''
   const end = to ? momentText(to, true) : ''

   return start && end
      ? start === end
         ? start
         : `${start} – ${end}`
      : start
        ? `since ${start}`
        : end
          ? `until ${end}`
          : ''
}

const listText = (values: string[], max = 2) =>
   values.length > max ? `${values.slice(0, max).join(', ')} +${values.length - max}` : values.join(', ')

export type Chip = { key: string; text: string; clear: Partial<PeopleFilters> }

// One removable chip per filter that is on, in the order of the panel.
export const chipsOf = (filters: PeopleFilters, accountName: (id: string) => string = id => id): Chip[] => {
   const chips: Chip[] = []
   const add = (key: string, text: string, clear: Partial<PeopleFilters>) => chips.push({ key, text, clear })

   if (filters.name) add('name', `Name: ${filters.name}`, { name: undefined })
   if (filters.companies.length) add('companies', `Company: ${listText(filters.companies)}`, { companies: [] })
   if (filters.title) add('title', `Title: ${filters.title}`, { title: undefined })
   if (filters.countries.length) add('countries', `Country: ${listText(filters.countries)}`, { countries: [] })
   if (filters.skills.length) {
      add(
         'skills',
         `Skills${filters.skills.length > 1 ? ` (${filters.skillsMode})` : ''}: ${listText(filters.skills)}`,
         {
            skills: [],
            skillsMode: 'all',
         }
      )
   }
   if (filters.premium !== undefined) {
      add('premium', filters.premium ? 'Premium' : 'Not Premium', { premium: undefined })
   }
   if (filters.connection) {
      add(
         'connection',
         filters.connection === 'NOT_CONNECTED'
            ? 'Not connected'
            : filters.connection === 'DISCOVERY'
              ? 'Discovery'
              : filters.connectedTo
                ? `Connected to ${accountName(filters.connectedTo)}`
                : 'Connected',
         {
            connection: undefined,
            connectedTo: undefined,
         }
      )
   }
   for (const key of RANGE_KEYS) {
      const text = rangeText(filters[key])

      if (text) add(key, `${RANGE_WORDS[key]}: ${text}`, { [key]: {} })
   }
   if (filters.invites.length) {
      add('invites', `Invite: ${listText(filters.invites.map(state => INVITE_WORDS[state]))}`, { invites: [] })
   }
   if (filters.neverMessaged) add('neverMessaged', 'Never messaged', { neverMessaged: false })
   if (filters.replyWaiting) add('replyWaiting', 'Reply waiting', { replyWaiting: false })
   if (filters.noLabels) add('noLabels', 'No labels', { noLabels: false })
   if (filters.labels.length) {
      add('labels', `Labels (${filters.labelsMode}): ${listText(filters.labels)}`, {
         labels: [],
         labelsMode: 'any',
      })
   }
   if (filters.statuses.length) {
      add('statuses', `Status: ${listText(filters.statuses.map(statusWord))}`, { statuses: [] })
   }
   if (filters.profileRead !== undefined) {
      add('profileRead', filters.profileRead ? 'Profile read' : 'Profile not read', {
         profileRead: undefined,
      })
   }

   return chips
}

// What brain gets: local moments become exact instants (a to-minute counts to its last millisecond), empty ranges go.
export const apiFilters = (filters: PeopleFilters): ApiFilters => {
   const instant = (value: string | undefined, end: boolean) => {
      const date = fromLocal(value)

      return date ? new Date(date.getTime() + (end ? 59_999 : 0)).toISOString() : undefined
   }
   const range = ({ from, to }: DateRange) =>
      from || to
         ? {
              from: instant(from, false),
              to: instant(to, true),
           }
         : undefined

   return {
      ...filters,
      connectedAt: range(filters.connectedAt),
      lastSent: range(filters.lastSent),
      lastReceived: range(filters.lastReceived),
      lastTouch: range(filters.lastTouch),
      firstSeen: range(filters.firstSeen),
   }
}

// The filters live in the address as one JSON value, so reload, back and a shared link keep them. A value that does not fit is
// dropped as a whole rather than half-read.
export const readFilters = (value: string | null): PeopleFilters => {
   if (!value) {
      return NO_FILTERS
   }

   try {
      return filtersSchema.safeParse(JSON.parse(value)).data ?? NO_FILTERS
   } catch {
      return NO_FILTERS
   }
}

// Only what is on is written, so an untouched view keeps a clean address.
export const writeFilters = (filters: PeopleFilters) => {
   const empty = new Map(Object.entries(NO_FILTERS).map(([key, value]) => [key, JSON.stringify(value)]))
   const on = Object.fromEntries(
      Object.entries(filters).filter(([key, value]) => value !== undefined && JSON.stringify(value) !== empty.get(key))
   )

   return Object.keys(on).length > 0 ? JSON.stringify(on) : null
}

// My network showing the people connected to one LinkedIn account (the account's "Connections").
export const connectionsPage = (accountId: string) =>
   `/network/${encodeURIComponent(accountId)}?${new URLSearchParams({
      filters:
         writeFilters({
            ...NO_FILTERS,
            connection: 'CONNECTED',
            connectedTo: accountId,
         }) ?? '',
   }).toString()}`
