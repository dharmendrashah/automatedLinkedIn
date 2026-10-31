import { toCsv } from 'core'

import { INVITES_LIVE } from 'env'

import { type PersonFit, type PersonStatus, Prisma } from 'generated/prisma/client'

import { type PeopleFilters } from '@automatedLinkedIn/contracts'

import { ClientService } from './client.service'
import { likeOf } from './companyFilters'
import { ConflictError } from './conflict'
import { DataReadService } from './dataRead.service'
import { type ImportEntry, type Imported, LABEL_LIMIT, appendNote, importedOf } from './linkedInRecord'
import { type PeopleSort, type PeopleTab, orderOf, peopleWhere } from './peopleFilters'
import { PRIORITY } from './peopleIndex'
import { PeopleIndexService } from './peopleIndex.service'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'
import { WorkflowListService } from './workflowList.service'

// My network (.plan/network-hub.md): the people of one client, what to do today, and the client's own changes to them.

export type PeopleQuery = {
   clientId: string
   tab: PeopleTab
   accountId?: string
   search?: string
   foundBy?: string
   fit?: PersonFit
   label?: string
   onlyNew?: boolean
   filters?: PeopleFilters
   sort?: PeopleSort
   // How many rows of the view come before this page.
   cursor?: number
   limit: number
}

export type ViewQuery = Omit<PeopleQuery, 'tab' | 'sort' | 'cursor' | 'limit'>

type ImportState = 'NEW' | 'ALREADY_HERE' | 'DO_NOT_CONTACT'

const blockedOf = async (userId: string, slugs: string[]) =>
   new Set(
      (
         await PrismaService.client.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         })
      ).map(({ slug }) => slug)
   )

// The import's labels join the person's own; its notes are added below theirs unless they already hold them.
const keepOwnFields = async (userId: string, clientId: string, profile: Imported) => {
   const person = await PrismaService.client.person.findFirst({
      where: {
         userId,
         clientId,
         slug: profile.slug,
      },
      select: {
         id: true,
         labels: true,
         notes: true,
      },
   })

   if (!person) {
      return
   }

   const notes = appendNote(person.notes, profile.notes)

   await PrismaService.client.person.update({
      where: { id: person.id },
      data: {
         labels: [...new Set([...person.labels, ...profile.labels])].slice(0, LABEL_LIMIT),
         notes,
      },
   })
}

export type PersonChanges = {
   status?: PersonStatus
   labels?: string[]
   notes?: string | null
   doNotContact?: boolean
}

type PeopleRow = NonNullable<Awaited<ReturnType<typeof PeopleService.list>>>['items'][number]

// Counts stop here and show as "10k+": no count ever reads a whole table.
export const COUNT_CAP = 10_000
// The `clientId` that means every client of the owner (.plan/network-all-clients.md).
export const ALL_CLIENTS = 'all'
export const EXPORT_CAP = 10_000
const SEARCH_CAP = 1_000
const OPTIONS_CAP = 200
// Values a searchable picker gets per keystroke.
const PICK_CAP = 50
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const CLOSED: PersonStatus[] = ['NOT_INTERESTED', 'DONE']
const SLUG_IN_LINK = /linkedin\.com\/in\/([^/?#\s]+)/i
const EXPORT_HEADER = [
   'Name',
   'Profile link',
   'Headline',
   'Company',
   'Reason',
   'Found by',
   'Fit',
   'Status',
   'Labels',
   'Last touch',
]

// People ready to invite are in Needs me only while invites are live.
const needsMeFrom = () => (INVITES_LIVE ? PRIORITY.INVITE : PRIORITY.REQUEST)

const TAB_WHERE: Record<PeopleTab, Prisma.PersonWhereInput> = {
   get NEEDS_ME() {
      return {
         doNotContact: false,
         priority: { gte: needsMeFrom() },
         status: { notIn: CLOSED },
      }
   },
   WAITING: {
      doNotContact: false,
      waiting: true,
      status: { notIn: CLOSED },
   },
   EVERYONE: { doNotContact: false },
   DO_NOT_CONTACT: { doNotContact: true },
}

const TAB_SQL: Record<PeopleTab, Prisma.Sql> = {
   get NEEDS_ME() {
      return Prisma.sql`NOT "doNotContact" AND "priority" >= ${needsMeFrom()} AND "status" NOT IN ('NOT_INTERESTED', 'DONE')`
   },
   WAITING: Prisma.sql`NOT "doNotContact" AND "waiting" AND "status" NOT IN ('NOT_INTERESTED', 'DONE')`,
   EVERYONE: Prisma.sql`NOT "doNotContact"`,
   DO_NOT_CONTACT: Prisma.sql`"doNotContact"`,
}

const rowSelect = {
   id: true,
   clientId: true,
   slug: true,
   name: true,
   headline: true,
   company: true,
   photoUrl: true,
   status: true,
   labels: true,
   fit: true,
   reasonKind: true,
   reasonText: true,
   reasonUrl: true,
   reasonAt: true,
   foundBy: true,
   priority: true,
   waiting: true,
   lastTouchAt: true,
   firstSeenAt: true,
   doNotContact: true,
   title: true,
   country: true,
   companySlug: true,
   premium: true,
   profileRead: true,
   connectedAt: true,
   lastSentAt: true,
   lastReceivedAt: true,
   inviteState: true,
   links: {
      select: {
         kind: true,
         accountId: true,
         sourceId: true,
         at: true,
      },
   },
} satisfies Prisma.PersonSelect

// The words of a search as a prefix full-text query; a profile link searches its slug instead.
const searchOf = (text: string) => {
   const [, slug] = SLUG_IN_LINK.exec(text) ?? []

   if (slug) {
      return { slug: decodeURIComponent(slug) }
   }

   const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 6)

   return words.length > 0 ? { query: words.map(word => `${word}:*`).join(' & ') } : null
}

const cappedCount = async (clientIds: string[], condition: Prisma.Sql) => {
   const [row] = await PrismaService.client.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS "count" FROM (
         SELECT 1 FROM "Person" WHERE "clientId" = ANY(${clientIds}) AND ${condition} LIMIT ${COUNT_CAP + 1}
      ) capped`

   return Number(row?.count ?? 0)
}

type Scope = {
   ids: string[]
   name: string
   // When the owner last left My network on each client; a person is new after it.
   seenAt: Map<string, Date | null>
}

// The clients a view covers: one of the owner's, or all of them for ALL_CLIENTS. null when there is none.
const scopeOf = async (userId: string, clientId: string): Promise<Scope | null> => {
   const clients = await PrismaService.client.client.findMany({
      where: {
         userId,
         ...(clientId === ALL_CLIENTS ? {} : { id: clientId }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
         id: true,
         name: true,
         seenAt: true,
      },
   })

   return clients.length > 0
      ? {
           ids: clients.map(({ id }) => id),
           name: clientId === ALL_CLIENTS ? 'All clients' : (clients[0]?.name ?? ''),
           seenAt: new Map(clients.map(({ id, seenAt }) => [id, seenAt])),
        }
      : null
}

const isNewIn = (scope: Scope, clientId: string, firstSeenAt: Date) => {
   const seenAt = scope.seenAt.get(clientId)

   return seenAt !== null && seenAt !== undefined && firstSeenAt > seenAt
}

const newWhere = (scope: Scope): Prisma.PersonWhereInput => ({
   OR: [...scope.seenAt].flatMap(([clientId, seenAt]) =>
      seenAt
         ? [
              {
                 clientId,
                 firstSeenAt: { gt: seenAt },
              },
           ]
         : []
   ),
})

// What a view asks for beyond its tab: the clients, the account, the search, the quick filters and the Filters panel.
const viewWhere = async (scope: Scope, query: ViewQuery): Promise<Prisma.PersonWhereInput> => {
   const search = query.search ? searchOf(query.search) : null
   const matching =
      search && 'query' in search
         ? (
              await PrismaService.client.$queryRaw<Array<{ id: string }>>`
                 SELECT "id" FROM "Person"
                 WHERE "clientId" = ANY(${scope.ids}) AND "search" @@ to_tsquery('simple', ${search.query})
                 ORDER BY "lastTouchAt" DESC LIMIT ${SEARCH_CAP}`
           ).map(({ id }) => id)
         : undefined

   return {
      clientId: { in: scope.ids },
      AND: [
         ...(query.accountId ? [{ links: { some: { accountId: query.accountId } } }] : []),
         ...(query.filters ? peopleWhere(query.filters) : []),
         ...(query.onlyNew ? [newWhere(scope)] : []),
      ],
      ...(query.foundBy ? { foundBy: { has: query.foundBy } } : {}),
      ...(query.fit ? { fit: query.fit } : {}),
      ...(query.label ? { labels: { has: query.label } } : {}),
      ...(search && 'slug' in search ? { slug: search.slug } : {}),
      ...(matching ? { id: { in: matching } } : {}),
   }
}

const ownedPerson = (userId: string, id: string) =>
   PrismaService.client.person.findFirst({
      where: {
         id,
         userId,
      },
      select: {
         id: true,
         slug: true,
         clientId: true,
      },
   })

export class PeopleService {
   // One page of a client's people (or all clients') in a tab, newest touch first (Needs me: replies, then requests). null when the
   // client is not the owner's.
   public static async list(userId: string, query: PeopleQuery) {
      const scope = await scopeOf(userId, query.clientId)

      if (!scope) {
         return null
      }

      const where: Prisma.PersonWhereInput = { AND: [await viewWhere(scope, query), TAB_WHERE[query.tab]] }
      const skip = query.cursor ?? 0
      const [rows, total] = await Promise.all([
         PrismaService.client.person.findMany({
            where,
            orderBy: orderOf(query.tab, query.sort),
            skip,
            take: query.limit + 1,
            select: rowSelect,
         }),
         PrismaService.client.person.count({
            where,
            take: COUNT_CAP + 1,
         }),
      ])
      const items = rows.slice(0, query.limit).map(row => ({
         ...row,
         isNew: isNewIn(scope, row.clientId, row.firstSeenAt),
      }))

      return {
         items,
         // Capped like the tab counts: COUNT_CAP + 1 reads as "10k+".
         total,
         next: rows.length > query.limit ? skip + query.limit : null,
      }
   }

   // How many people each tab holds, up to COUNT_CAP + 1 ("10k+").
   // How many people each tab holds under the view's search and filters, up to COUNT_CAP + 1 ("10k+").
   public static async counts(userId: string, query: ViewQuery) {
      const scope = await scopeOf(userId, query.clientId)

      if (!scope) {
         return null
      }

      const base = await viewWhere(scope, query)
      const count = (tab: PeopleTab) =>
         PrismaService.client.person.count({
            where: { AND: [base, TAB_WHERE[tab]] },
            take: COUNT_CAP + 1,
         })
      const [NEEDS_ME, WAITING, EVERYONE, DO_NOT_CONTACT] = await Promise.all([
         count('NEEDS_ME'),
         count('WAITING'),
         count('EVERYONE'),
         count('DO_NOT_CONTACT'),
      ])

      return {
         NEEDS_ME,
         WAITING,
         EVERYONE,
         DO_NOT_CONTACT,
         cap: COUNT_CAP,
      }
   }

   // The Today line of every client of the owner: replies and requests waiting, people ready to invite (once invites are live), invites
   // waiting for an answer, people new since the owner's last visit, and the accounts whose invites are stopped.
   public static async today(userId: string, now = new Date()) {
      const db = PrismaService.client
      const [clients, defaultId, stoppedAccounts] = await Promise.all([
         db.client.findMany({
            where: { userId },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            select: {
               id: true,
               name: true,
               isDefault: true,
               seenAt: true,
            },
         }),
         ClientService.defaultId(userId),
         db.linkedInAccount.findMany({
            where: {
               userId,
               invitesStoppedAt: { not: null },
            },
            select: {
               id: true,
               email: true,
               displayName: true,
               clientId: true,
               lastVerifiedAt: true,
               invitesStoppedAt: true,
               invitesStopUntil: true,
               invitesStopReason: true,
            },
         }),
      ])
      const stopped = stoppedAccounts.filter(account =>
         account.invitesStopUntil
            ? account.invitesStopUntil > now
            : !(account.lastVerifiedAt && account.invitesStoppedAt && account.lastVerifiedAt > account.invitesStoppedAt)
      )

      return Promise.all(
         clients.map(async client => {
            const [replies, requests, invites, waitingInvites, fresh] = await Promise.all([
               cappedCount([client.id], Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.REPLY}`),
               cappedCount([client.id], Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.REQUEST}`),
               INVITES_LIVE
                  ? cappedCount([client.id], Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.INVITE}`)
                  : Promise.resolve(0),
               db.linkedInInvite.count({
                  where: {
                     clientId: client.id,
                     state: { in: ['SENT', 'UNKNOWN'] },
                  },
               }),
               client.seenAt
                  ? cappedCount([client.id], Prisma.sql`NOT "doNotContact" AND "firstSeenAt" > ${client.seenAt}`)
                  : Promise.resolve(0),
            ])

            return {
               clientId: client.id,
               name: client.name,
               isDefault: client.isDefault,
               replies,
               requests,
               invites,
               waitingInvites,
               fresh,
               invitesLive: INVITES_LIVE,
               stopped: stopped
                  .filter(account => (account.clientId ?? defaultId) === client.id)
                  .map(account => ({
                     accountId: account.id,
                     name: account.displayName ?? account.email,
                     reason: account.invitesStopReason ?? 'Invites are stopped.',
                  })),
            }
         })
      )
   }

   // The results line of a client: people new this week and what reads cost this month, and over the last `days` the invites sent,
   // accepted and answered, by account and by the source that led to each (.plan/network-invites.md). An accept and the reads of
   // that person are credited to the invite's source.
   public static async results(userId: string, clientId: string, days = 7, now = new Date()) {
      const scope = await scopeOf(userId, clientId)

      if (!scope) {
         return null
      }

      const inScope = { in: scope.ids }
      const db = PrismaService.client
      const since = new Date(now.getTime() - days * DAY_MS)
      const [newThisWeek, spent, invites] = await Promise.all([
         cappedCount(
            scope.ids,
            Prisma.sql`NOT "doNotContact" AND "firstSeenAt" > ${new Date(now.getTime() - WEEK_MS)}`
         ),
         db.spendLedger.aggregate({
            where: {
               userId,
               clientId: inScope,
               month: now.toISOString().slice(0, 7),
            },
            _sum: { amountMicros: true },
         }),
         db.linkedInInvite.findMany({
            where: {
               clientId: inScope,
               OR: [{ invitedAt: { gte: since } }, { acceptedAt: { gte: since } }],
            },
            take: COUNT_CAP,
            select: {
               slug: true,
               source: true,
               invitedAt: true,
               acceptedAt: true,
               account: {
                  select: {
                     id: true,
                     email: true,
                     displayName: true,
                  },
               },
            },
         }),
      ])
      const slugs = [...new Set(invites.map(({ slug }) => slug))]
      const [replied, reads, lists] = await Promise.all([
         db.person.findMany({
            where: {
               clientId: inScope,
               slug: { in: slugs },
               status: 'REPLIED',
            },
            select: { slug: true },
         }),
         db.dataRead.groupBy({
            by: ['slug'],
            where: {
               userId,
               clientId: inScope,
               slug: { in: slugs },
            },
            _sum: { costMicros: true },
         }),
         db.workflowList.findMany({
            where: { userId },
            select: {
               id: true,
               name: true,
            },
         }),
      ])
      const answered = new Set(replied.map(({ slug }) => slug))
      const costOf = new Map(reads.map(({ slug, _sum }) => [slug, _sum.costMicros ?? 0]))
      const listNames = new Map(lists.map(({ id, name }) => [`list:${id}`, name]))
      const SOURCES: Record<string, string> = {
         request: 'Requests',
         connection: 'Connections',
         target: 'Target profiles',
      }
      const sum = (rows: typeof invites) => {
         const accepted = rows.filter(({ acceptedAt }) => acceptedAt && acceptedAt >= since).length
         const spentMicros = rows.reduce((total, { slug }) => total + (costOf.get(slug) ?? 0), 0)

         return {
            invited: rows.filter(({ invitedAt }) => invitedAt && invitedAt >= since).length,
            accepted,
            replied: rows.filter(({ slug }) => answered.has(slug)).length,
            spentMicros,
            perAcceptMicros: accepted > 0 ? Math.round(spentMicros / accepted) : null,
         }
      }
      const groupBy = (keyOf: (row: (typeof invites)[number]) => string, nameOf: (key: string) => string) =>
         [...new Set(invites.map(keyOf))].map(key => ({
            key,
            name: nameOf(key),
            ...sum(invites.filter(row => keyOf(row) === key)),
         }))
      const accountNames = new Map(invites.map(({ account }) => [account.id, account.displayName ?? account.email]))

      return {
         newThisWeek,
         dataSpentMicros: spent._sum.amountMicros ?? 0,
         cap: COUNT_CAP,
         days,
         ...sum(invites),
         byAccount: groupBy(
            ({ account }) => account.id,
            key => accountNames.get(key) ?? 'Removed account'
         ),
         bySource: groupBy(
            ({ source }) => source ?? 'none',
            key => SOURCES[key] ?? listNames.get(key) ?? (key === 'none' ? 'Not known' : 'Removed list')
         ),
      }
   }

   // What the filters can pick for a client, most common first: its people's countries, companies (top OPTIONS_CAP) and labels.
   public static async filterOptions(userId: string, clientId: string) {
      const scope = await scopeOf(userId, clientId)

      if (!scope) {
         return null
      }

      const db = PrismaService.client
      const [countries, companies, labels] = await Promise.all([
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "country" AS "value", count(*) AS "count" FROM "Person"
            WHERE "clientId" = ANY(${scope.ids}) AND "country" IS NOT NULL
            GROUP BY "country" ORDER BY count(*) DESC, "country" LIMIT ${OPTIONS_CAP}`,
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "company" AS "value", count(*) AS "count" FROM "Person"
            WHERE "clientId" = ANY(${scope.ids}) AND "company" IS NOT NULL AND "company" <> ''
            GROUP BY "company" ORDER BY count(*) DESC, "company" LIMIT ${OPTIONS_CAP}`,
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "label" AS "value", count(*) AS "count" FROM "Person", unnest("labels") AS "label"
            WHERE "clientId" = ANY(${scope.ids})
            GROUP BY "label" ORDER BY count(*) DESC, "label" LIMIT ${OPTIONS_CAP}`,
      ])
      const counted = (rows: Array<{ value: string; count: bigint }>) =>
         rows.map(({ value, count }) => ({
            value,
            count: Number(count),
         }))

      return {
         countries: counted(countries),
         companies: counted(companies),
         labels: counted(labels),
      }
   }

   // The skills of a client's people for the Skills picker, most common first, narrowed to those containing `search` as typed.
   public static async skillOptions(userId: string, clientId: string, search: string) {
      const scope = await scopeOf(userId, clientId)

      if (!scope) {
         return null
      }

      const rows = await PrismaService.client.$queryRaw<Array<{ value: string; count: bigint }>>`
         SELECT "skill" AS "value", count(*) AS "count" FROM "Person", unnest("skills") AS "skill"
         WHERE "clientId" = ANY(${scope.ids}) AND "skill" ILIKE ${likeOf(search)}
         GROUP BY "skill" ORDER BY count(*) DESC, "skill" LIMIT ${PICK_CAP}`

      return rows.map(({ value, count }) => ({
         value,
         count: Number(count),
      }))
   }

   // The owner left My network on this client: people seen until now are not new any more.
   public static async seen(userId: string, clientId: string) {
      const { count } = await PrismaService.client.client.updateMany({
         where: {
            userId,
            ...(clientId === ALL_CLIENTS ? {} : { id: clientId }),
         },
         data: { seenAt: new Date() },
      })

      return count > 0
   }

   // The owner's person of a profile, the most recently touched when several clients have them.
   public static find(userId: string, slug: string) {
      return PrismaService.client.person.findFirst({
         where: {
            userId,
            slug,
         },
         orderBy: { lastTouchAt: 'desc' },
         select: { id: true },
      })
   }

   // One person with the rows behind them, for the drawer: which account has the request, connection or conversation.
   public static async get(userId: string, id: string) {
      const person = await PrismaService.client.person.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            ...rowSelect,
            clientId: true,
            notes: true,
            score: true,
            links: {
               select: {
                  kind: true,
                  sourceId: true,
                  accountId: true,
                  at: true,
                  account: {
                     select: {
                        email: true,
                        displayName: true,
                     },
                  },
               },
               orderBy: { at: 'desc' },
            },
         },
      })

      if (!person) {
         return null
      }

      const lists = person.foundBy.flatMap(source => (source.startsWith('list:') ? [source.slice(5)] : []))
      const names = lists.length
         ? await PrismaService.client.workflowList.findMany({
              where: {
                 userId,
                 id: { in: lists },
              },
              select: {
                 id: true,
                 name: true,
              },
           })
         : []

      return {
         ...person,
         url: profileUrlOf(person.slug),
         lists: names,
      }
   }

   // The client's own changes to a person. A status chosen here is kept by the index; New hands it back to the index.
   public static async update(userId: string, id: string, changes: PersonChanges) {
      const { count } = await PrismaService.client.person.updateMany({
         where: {
            id,
            userId,
         },
         data: {
            ...(changes.status
               ? {
                    status: changes.status,
                    statusSetAt: changes.status === 'NEW' ? null : new Date(),
                 }
               : {}),
            ...(changes.labels ? { labels: changes.labels } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
            ...(changes.doNotContact !== undefined ? { doNotContact: changes.doNotContact } : {}),
         },
      })

      return count === 1
   }

   // The same changes to many people of one client (or of any client, for ALL_CLIENTS) at once. Resolves to how many changed.
   public static async updateMany(
      userId: string,
      clientId: string,
      ids: string[],
      changes: Omit<PersonChanges, 'notes'>
   ) {
      const { count } = await PrismaService.client.person.updateMany({
         where: {
            id: { in: ids },
            userId,
            ...(clientId === ALL_CLIENTS ? {} : { clientId }),
         },
         data: {
            ...(changes.status
               ? {
                    status: changes.status,
                    statusSetAt: changes.status === 'NEW' ? null : new Date(),
                 }
               : {}),
            ...(changes.doNotContact !== undefined ? { doNotContact: changes.doNotContact } : {}),
         },
      })

      if (changes.labels?.length) {
         await PrismaService.client.$executeRaw`
            UPDATE "Person" SET "labels" = ARRAY(SELECT DISTINCT unnest("labels" || ${changes.labels}::text[]))
            WHERE "id" = ANY(${ids}) AND "userId" = ${userId} AND (${clientId} = ${ALL_CLIENTS} OR "clientId" = ${clientId})`
      }

      return count
   }

   // Do not contact for every client of the owner: the profile is suppressed, and the index marks each of its people.
   public static async doNotContactEverywhere(userId: string, id: string) {
      const person = await ownedPerson(userId, id)

      if (!person) {
         return false
      }

      await PrismaService.client.suppression.upsert({
         where: {
            userId_slug: {
               userId,
               slug: person.slug,
            },
         },
         create: {
            userId,
            slug: person.slug,
         },
         update: {},
      })
      await PrismaService.client.person.updateMany({
         where: {
            userId,
            slug: person.slug,
         },
         data: { doNotContact: true },
      })

      return true
   }

   // Erases a person from every client of the owner: their requests, connections, conversations and messages, list rows, target,
   // snapshot and reads. Keeps the suppression (slug only) so no import brings them back, and one dated entry with nothing about
   // them.
   public static async erase(userId: string, id: string) {
      const person = await ownedPerson(userId, id)

      if (!person) {
         return false
      }

      const { slug } = person
      const urls = [profileUrlOf(slug), profileUrlOf(slug).slice(0, -1)]

      await PrismaService.client.$transaction(async tx => {
         await tx.linkedInConversation.deleteMany({
            where: {
               userId,
               OR: [{ contactProfileUrl: { in: urls } }, { replies: { some: { recipientSlug: slug } } }],
            },
         })
         await tx.linkedInReply.deleteMany({
            where: {
               userId,
               recipientSlug: slug,
            },
         })
         await tx.linkedInInvite.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.linkedInInvitation.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.linkedInConnection.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.workflowListMember.deleteMany({
            where: {
               slug,
               list: { userId },
            },
         })
         await tx.linkedInProfile.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.personSnapshot.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.dataRead.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.person.deleteMany({
            where: {
               userId,
               slug,
            },
         })
         await tx.suppression.upsert({
            where: {
               userId_slug: {
                  userId,
                  slug,
               },
            },
            create: {
               userId,
               slug,
            },
            update: {},
         })
         await tx.personErasure.create({ data: { userId } })
      })

      return true
   }

   // Adds imported profiles to a list of the client, made in the same step when named (.plan/network-import-people.md). People
   // on Do not contact are left out; people already in a list or the targets are skipped but still get the labels and notes. When
   // `read` is set, each person's full profile is read (paid); a read that cannot start now is counted, not failed.
   public static async add(
      userId: string,
      clientId: string,
      people: ImportEntry[],
      list: { id: string } | { name: string },
      read: boolean
   ) {
      const db = PrismaService.client
      const client = clientId === ALL_CLIENTS ? null : await scopeOf(userId, clientId)
      const [ownClientId] = client?.ids ?? []

      if (!ownClientId) {
         return null
      }

      const target =
         'id' in list
            ? await db.workflowList.findFirst({
                 where: {
                    id: list.id,
                    userId,
                 },
                 select: {
                    id: true,
                    clientId: true,
                 },
              })
            : await WorkflowListService.createList(userId, list.name)

      if (!target) {
         return null
      }

      if ('name' in list) {
         await db.workflowList.update({
            where: { id: target.id },
            data: { clientId: ownClientId },
         })
      }

      const listClientId = 'clientId' in target && target.clientId ? target.clientId : ownClientId
      const { links: profiles, invalid } = importedOf(people, 'profile')
      const blocked = await blockedOf(
         userId,
         profiles.map(({ slug }) => slug)
      )
      const kept = profiles.filter(({ slug }) => !blocked.has(slug))
      let added = 0
      let skipped = 0

      for (const profile of kept) {
         try {
            await WorkflowListService.addMember(userId, target.id, {
               slug: profile.slug,
               url: profile.url,
               name: null,
               headline: null,
               location: null,
               state: 'UNSCORED',
            })
            added += 1
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }

            skipped += 1
         }
      }

      if (kept.length > 0) {
         await PeopleIndexService.refresh(
            userId,
            kept.map(({ slug }) => slug)
         )
      }

      for (const profile of kept.filter(({ labels, notes }) => labels.length > 0 || notes)) {
         await keepOwnFields(userId, listClientId, profile)
      }

      let reading = 0

      for (const { slug } of read ? kept : []) {
         try {
            await DataReadService.queue({
               userId,
               kind: 'PROFILE',
               slug,
               operation: 'profiles',
               params: { queries: [profileUrlOf(slug)] },
               clientId: listClientId,
            })
            reading += 1
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }
         }
      }

      return {
         listId: target.id,
         added,
         skipped,
         blocked: blocked.size,
         invalid: invalid.length,
         reading,
         notRead: read ? kept.length - reading : 0,
      }
   }

   // What an import would do with each link, changing nothing: new, already here (a list, the targets or the client's people),
   // or on Do not contact. Links that are not profiles are counted; the same profile twice counts once.
   public static async preview(userId: string, clientId: string, urls: string[]) {
      const scope = await scopeOf(userId, clientId)

      if (!scope) {
         return null
      }

      const { links: profiles, invalid } = importedOf(
         urls.map(url => ({ url })),
         'profile'
      )
      const slugs = profiles.map(({ slug }) => slug)
      const db = PrismaService.client
      const [blocked, members, targets, known] = await Promise.all([
         blockedOf(userId, slugs),
         db.workflowListMember.findMany({
            where: {
               slug: { in: slugs },
               list: { userId },
            },
            select: { slug: true },
         }),
         db.linkedInProfile.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.person.findMany({
            where: {
               clientId: { in: scope.ids },
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
      ])
      const here = new Set([...members, ...targets, ...known].map(({ slug }) => slug))
      const stateOf = (slug: string): ImportState =>
         blocked.has(slug) ? 'DO_NOT_CONTACT' : here.has(slug) ? 'ALREADY_HERE' : 'NEW'

      return {
         profiles: profiles.map(({ url, slug, inputs }) => ({
            url,
            slug,
            inputs,
            state: stateOf(slug),
         })),
         invalid: invalid.length,
      }
   }

   // The owner's erasures and exports, newest first, for the Usage page: dates, clients and row counts, nothing about anyone.
   public static async audit(userId: string, take = 200) {
      const [erasures, exports, clients] = await Promise.all([
         PrismaService.client.personErasure.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
               id: true,
               createdAt: true,
            },
         }),
         PrismaService.client.peopleExport.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take,
            select: {
               id: true,
               clientId: true,
               rows: true,
               refused: true,
               createdAt: true,
            },
         }),
         PrismaService.client.client.findMany({
            where: { userId },
            select: {
               id: true,
               name: true,
            },
         }),
      ])
      const names = new Map(clients.map(({ id, name }) => [id, name]))

      return {
         erasures,
         exports: exports.map(({ clientId, ...entry }) => ({
            ...entry,
            client: names.get(clientId) ?? 'Removed client',
         })),
      }
   }

   // The people of one view as a CSV, at most EXPORT_CAP rows; a bigger view is refused. Every export is logged, refused or not.
   public static async export(userId: string, query: Omit<PeopleQuery, 'cursor' | 'limit'>) {
      const scope = await scopeOf(userId, query.clientId)
      const [clientId] = scope?.ids ?? []

      if (!scope || !clientId) {
         return null
      }

      const rows: PeopleRow[] = []
      let cursor: number | undefined
      let refused: boolean

      do {
         const page = await PeopleService.list(userId, {
            ...query,
            cursor,
            limit: 500,
         })

         rows.push(...(page?.items ?? []))
         cursor = page?.next ?? undefined
         refused = rows.length > EXPORT_CAP
      } while (cursor && !refused)

      await PrismaService.client.peopleExport.create({
         data: {
            userId,
            // All clients is logged against the first client (the default one).
            clientId,
            rows: refused ? 0 : rows.length,
            refused,
         },
      })

      if (refused) {
         throw new ConflictError(
            `At most ${EXPORT_CAP.toLocaleString('en')} people can be exported at once. Narrow the view first.`
         )
      }

      const lists = new Map(
         (
            await PrismaService.client.workflowList.findMany({
               where: { userId },
               select: {
                  id: true,
                  name: true,
               },
            })
         ).map(({ id, name }) => [`list:${id}`, name])
      )
      const sources: Record<string, string> = {
         request: 'Request',
         connection: 'Connection',
         target: 'Target profile',
      }

      return {
         fileName: `${scope.name.replace(/[^\w-]+/g, '-')}-people.csv`,
         csv: toCsv(
            EXPORT_HEADER,
            rows.map(row => [
               row.name,
               profileUrlOf(row.slug),
               row.headline,
               row.company,
               row.reasonText,
               row.foundBy.map(source => sources[source] ?? lists.get(source) ?? 'List').join('; '),
               row.fit === 'NONE' ? '' : row.fit === 'STRONG' ? 'Strong' : 'Maybe',
               row.status,
               row.labels.join('; '),
               row.lastTouchAt.toISOString().slice(0, 10),
            ])
         ),
      }
   }
}
