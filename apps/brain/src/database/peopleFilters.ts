import { type Prisma } from 'generated/prisma/client'

import { type PeopleFilters } from '@automatedLinkedIn/contracts'

import { PRIORITY } from './peopleIndex'

// My network's filters (.plan/network-filters.md) as Prisma conditions on `Person`, one per filter that is on; the caller ANDs
// them with the client, the tab and the search.

export const PEOPLE_TABS = ['NEEDS_ME', 'WAITING', 'EVERYONE', 'DO_NOT_CONTACT'] as const
export const PEOPLE_SORTS = [
   'name',
   'connectedAt',
   'lastSentAt',
   'lastReceivedAt',
   'lastTouchAt',
   'firstSeenAt',
] as const

export type PeopleTab = (typeof PEOPLE_TABS)[number]
export type PeopleSort = { by: (typeof PEOPLE_SORTS)[number]; desc: boolean }

type Where = Prisma.PersonWhereInput
type Range = { from?: Date; to?: Date } | undefined

const contains = (value: string) => ({
   contains: value,
   mode: 'insensitive' as const,
})

const anyOf = (field: 'company' | 'country', values: string[]): Where => ({
   OR: values.map(value => ({
      [field]: {
         equals: value,
         mode: 'insensitive' as const,
      },
   })),
})

const between = (
   field: 'connectedAt' | 'lastSentAt' | 'lastReceivedAt' | 'lastTouchAt' | 'firstSeenAt',
   range: Range
): Where[] =>
   range && (range.from || range.to)
      ? [
           {
              [field]: {
                 ...(range.from ? { gte: range.from } : {}),
                 ...(range.to ? { lte: range.to } : {}),
              },
           },
        ]
      : []

const when = (on: boolean, where: Where): Where[] => (on ? [where] : [])

const labelsWhere = ({ labels, labelsMode }: PeopleFilters) =>
   labelsMode === 'all' ? { hasEvery: labels } : { hasSome: labels }

const skillsWhere = ({ skills, skillsMode }: PeopleFilters) =>
   skillsMode === 'any' ? { hasSome: skills } : { hasEvery: skills }

export const peopleWhere = (filters: PeopleFilters): Where[] => [
   ...when(Boolean(filters.name), { name: contains(filters.name ?? '') }),
   ...when(filters.companies.length > 0, anyOf('company', filters.companies)),
   ...when(Boolean(filters.title), { title: contains(filters.title ?? '') }),
   ...when(filters.countries.length > 0, anyOf('country', filters.countries)),
   ...when(filters.skills.length > 0, { skills: skillsWhere(filters) }),
   ...when(filters.premium !== undefined, { premium: filters.premium }),
   ...when(filters.connection === 'CONNECTED', { connectedAt: { not: null } }),
   ...when(filters.connection === 'NOT_CONNECTED', { connectedAt: null }),
   ...when(filters.connection === 'DISCOVERY', {
      connectedAt: null,
      inviteState: 'NONE',
      links: { none: { accountId: { not: null } } },
   }),
   ...when(Boolean(filters.connectedTo), {
      links: {
         some: {
            accountId: filters.connectedTo,
            kind: 'CONNECTION',
         },
      },
   }),
   ...between('connectedAt', filters.connectedAt),
   ...when(filters.invites.length > 0, { inviteState: { in: filters.invites } }),
   ...between('lastSentAt', filters.lastSent),
   ...between('lastReceivedAt', filters.lastReceived),
   ...when(filters.neverMessaged, { links: { none: { kind: 'CONVERSATION' } } }),
   ...when(filters.replyWaiting, { priority: PRIORITY.REPLY }),
   ...between('lastTouchAt', filters.lastTouch),
   ...between('firstSeenAt', filters.firstSeen),
   ...when(filters.labels.length > 0, { labels: labelsWhere(filters) }),
   ...when(filters.noLabels, { labels: { isEmpty: true } }),
   ...when(filters.statuses.length > 0, { status: { in: filters.statuses } }),
   ...when(filters.profileRead !== undefined, { profileRead: filters.profileRead }),
]

// The tab's own order (Needs me: replies, then requests), or the column asked for (empty values last); the id breaks ties.
export const orderOf = (tab: PeopleTab, sort?: PeopleSort): Prisma.PersonOrderByWithRelationInput[] => {
   if (!sort) {
      return [...(tab === 'NEEDS_ME' ? [{ priority: 'desc' as const }] : []), { lastTouchAt: 'desc' }, { id: 'desc' }]
   }

   const direction = sort.desc ? ('desc' as const) : ('asc' as const)

   return [
      sort.by === 'lastTouchAt' || sort.by === 'firstSeenAt'
         ? { [sort.by]: direction }
         : {
              [sort.by]: {
                 sort: direction,
                 nulls: 'last' as const,
              },
           },
      { id: 'desc' },
   ]
}
