import { type Prisma } from 'generated/prisma/client'

import { type PeopleFilters, readPeopleFilters } from '@automatedLinkedIn/contracts'

import { type InputFilter } from './linkedInRecord'
import { peopleWhere } from './peopleFilters'
import { worksAtWhere } from './peopleWorksAt'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'

// A Profiles input block that takes people from My network (.plan/input-blocks-filters.md): the page's own filters, the block's
// time frame and labels. People on Do not contact and suppressed people are never taken.

export type NetworkPick = { people: PeopleFilters | null }

// A count stops here, as the page's counts do; no count reads the whole table.
const COUNT_CAP = 10_000

// The date the time frame is about, as the column of a person; "added" is when they were first seen.
const COLUMNS = {
   added: 'firstSeenAt',
   connected: 'connectedAt',
   lastContact: 'lastTouchAt',
   lastSent: 'lastSentAt',
   lastReply: 'lastReceivedAt',
   invitedOn: 'invitedAt',
} as const

type Column = (typeof COLUMNS)[keyof typeof COLUMNS]

const columnOf = (field: string): Column => COLUMNS[field as keyof typeof COLUMNS] ?? 'firstSeenAt'

const whereOf = async (userId: string, filter: InputFilter, network: NetworkPick): Promise<Prisma.PersonWhereInput> => {
   const suppressed = (
      await PrismaService.client.suppression.findMany({
         where: { userId },
         select: { slug: true },
      })
   ).map(({ slug }) => slug)
   const column = columnOf(filter.field)

   return {
      userId,
      doNotContact: false,
      ...(suppressed.length > 0 || filter.notSlugs.length > 0
         ? { slug: { notIn: [...suppressed, ...filter.notSlugs] } }
         : {}),
      AND: [
         ...(network.people ? peopleWhere(network.people) : []),
         ...(network.people ? await worksAtWhere(userId, network.people.worksAt) : []),
         ...(filter.since || filter.until
            ? [
                 {
                    [column]: {
                       ...(filter.since ? { gte: filter.since } : {}),
                       ...(filter.until ? { lt: filter.until } : {}),
                    },
                 },
              ]
            : []),
         ...(filter.labels.length > 0
            ? [{ labels: filter.labelMatch === 'all' ? { hasEvery: filter.labels } : { hasSome: filter.labels } }]
            : []),
         ...(filter.withoutLabels.length > 0 ? [{ NOT: { labels: { hasSome: filter.withoutLabels } } }] : []),
      ],
   }
}

// The newest (or oldest) first by the date asked, empty dates last; the id breaks ties. "Best score" puts the highest score first and
// people with no score last.
const orderOf = (filter: InputFilter): Prisma.PersonOrderByWithRelationInput[] => {
   const direction = filter.order === 'oldest' ? ('asc' as const) : ('desc' as const)
   const column = columnOf(filter.field)

   if (filter.order === 'score') {
      return [
         {
            score: {
               sort: 'desc',
               nulls: 'last',
            },
         },
         { id: 'desc' },
      ]
   }

   return [
      column === 'firstSeenAt' || column === 'lastTouchAt'
         ? { [column]: direction }
         : {
              [column]: {
                 sort: direction,
                 nulls: 'last' as const,
              },
           },
      { id: direction },
   ]
}

export class InputPeopleService {
   // The page's filters a block asks for.
   public static scope(filtersText: string): NetworkPick {
      return { people: readPeopleFilters(filtersText).filters }
   }

   public static async pick(userId: string, take: number, filter: InputFilter, network: NetworkPick) {
      const rows = await PrismaService.client.person.findMany({
         where: await whereOf(userId, filter, network),
         orderBy: orderOf(filter),
         take,
         select: {
            slug: true,
            name: true,
            headline: true,
            country: true,
         },
      })

      return rows.map(row => ({
         slug: row.slug,
         url: profileUrlOf(row.slug),
         fullName: row.name,
         headline: row.headline,
         location: row.country,
      }))
   }

   // Counting stops at the cap like the page's counts.
   public static async count(userId: string, filter: InputFilter, network: NetworkPick) {
      return PrismaService.client.person.count({
         where: await whereOf(userId, filter, network),
         take: COUNT_CAP + 1,
      })
   }
}
