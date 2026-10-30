// The filters of My network beyond the toolbar's Found by, Fit and Label (.plan/network-filters.md).
import { type PersonStatus, statusWord } from '../words'

export type DateRange = { from?: string; to?: string }

export const INVITE_STATES = ['NONE', 'PENDING', 'ACCEPTED', 'ENDED'] as const

export type InviteState = (typeof INVITE_STATES)[number]

export type PeopleFilters = {
   name?: string
   companies: string[]
   title?: string
   countries: string[]
   premium?: 'yes' | 'no'
   connection?: 'connected' | 'not-connected'
   connectedTo?: string
   connectedAt: DateRange
   invites: InviteState[]
   lastSent: DateRange
   lastReply: DateRange
   neverMessaged: boolean
   replyWaiting: boolean
   lastTouch: DateRange
   firstSeen: DateRange
   labels: string[]
   labelsMode: 'any' | 'all'
   noLabels: boolean
   statuses: PersonStatus[]
   profileRead?: 'read' | 'not-read'
}

export const NO_FILTERS: PeopleFilters = {
   companies: [],
   countries: [],
   connectedAt: {},
   invites: [],
   lastSent: {},
   lastReply: {},
   neverMessaged: false,
   replyWaiting: false,
   lastTouch: {},
   firstSeen: {},
   labels: [],
   labelsMode: 'any',
   noLabels: false,
   statuses: [],
}

export const INVITE_WORDS: Record<InviteState, string> = {
   NONE: 'Not invited',
   PENDING: 'Pending',
   ACCEPTED: 'Accepted',
   ENDED: 'Withdrawn or ended',
}

export const RANGE_KEYS = ['connectedAt', 'lastSent', 'lastReply', 'lastTouch', 'firstSeen'] as const

export type RangeKey = (typeof RANGE_KEYS)[number]

export const RANGE_WORDS: Record<RangeKey, string> = {
   connectedAt: 'Connected',
   lastSent: 'Last message from you',
   lastReply: 'Last reply from them',
   lastTouch: 'Last touch',
   firstSeen: 'First seen',
}

const DAY_MS = 24 * 60 * 60 * 1000

const day = (date: Date) =>
   `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Quick choices for a date filter, as the owner's own days.
export const QUICK_RANGES = [
   ['Today', (now: Date) => ({ from: day(now), to: day(now) })],
   ['Last 7 days', (now: Date) => ({ from: day(new Date(now.getTime() - 6 * DAY_MS)), to: day(now) })],
   ['Last 30 days', (now: Date) => ({ from: day(new Date(now.getTime() - 29 * DAY_MS)), to: day(now) })],
   ['Last 90 days', (now: Date) => ({ from: day(new Date(now.getTime() - 89 * DAY_MS)), to: day(now) })],
   ['This month', (now: Date) => ({ from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now) })],
] as const

const shortDay = (value: string) =>
   new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
   })

export const rangeText = ({ from, to }: DateRange) =>
   from && to
      ? from === to
         ? shortDay(from)
         : `${shortDay(from)} – ${shortDay(to)}`
      : from
        ? `since ${shortDay(from)}`
        : to
          ? `until ${shortDay(to)}`
          : ''

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
   if (filters.premium) add('premium', filters.premium === 'yes' ? 'Premium' : 'Not Premium', { premium: undefined })
   if (filters.connection) {
      add(
         'connection',
         filters.connection === 'not-connected'
            ? 'Not connected'
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
   if (filters.profileRead) {
      add('profileRead', filters.profileRead === 'read' ? 'Profile read' : 'Profile not read', {
         profileRead: undefined,
      })
   }

   return chips
}
