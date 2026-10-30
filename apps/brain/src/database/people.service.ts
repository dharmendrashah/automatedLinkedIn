import { type LinkedInLink, toCsv } from 'core'

import { INVITES_LIVE } from 'env'

import { type PersonFit, type PersonStatus, Prisma } from 'generated/prisma/client'

import { type PeopleFilters } from '@automatedLinkedIn/contracts'

import { ClientService } from './client.service'
import { ConflictError } from './conflict'
import { type PeopleSort, type PeopleTab, orderOf, peopleWhere } from './peopleFilters'
import { PRIORITY } from './peopleIndex'
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

export type PersonChanges = {
   status?: PersonStatus
   labels?: string[]
   notes?: string | null
   doNotContact?: boolean
}

type PeopleRow = NonNullable<Awaited<ReturnType<typeof PeopleService.list>>>['items'][number]

// Counts stop here and show as "10k+": no count ever reads a whole table.
export const COUNT_CAP = 10_000
export const EXPORT_CAP = 10_000
const SEARCH_CAP = 1_000
const OPTIONS_CAP = 200
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

const cappedCount = async (clientId: string, condition: Prisma.Sql) => {
   const [row] = await PrismaService.client.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS "count" FROM (
         SELECT 1 FROM "Person" WHERE "clientId" = ${clientId} AND ${condition} LIMIT ${COUNT_CAP + 1}
      ) capped`

   return Number(row?.count ?? 0)
}

const ownedClient = (userId: string, clientId: string) =>
   PrismaService.client.client.findFirst({
      where: {
         id: clientId,
         userId,
      },
      select: {
         id: true,
         name: true,
         seenAt: true,
      },
   })

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
   // One page of a client's people in a tab, newest touch first (Needs me: replies, then requests). null when the client is not
   // the owner's. Pages follow `next`, never an offset.
   public static async list(userId: string, query: PeopleQuery) {
      const client = await ownedClient(userId, query.clientId)

      if (!client) {
         return null
      }

      const search = query.search ? searchOf(query.search) : null
      const matching =
         search && 'query' in search
            ? (
                 await PrismaService.client.$queryRaw<Array<{ id: string }>>`
                    SELECT "id" FROM "Person"
                    WHERE "clientId" = ${client.id} AND "search" @@ to_tsquery('simple', ${search.query})
                    ORDER BY "lastTouchAt" DESC LIMIT ${SEARCH_CAP}`
              ).map(({ id }) => id)
            : undefined
      const where: Prisma.PersonWhereInput = {
         clientId: client.id,
         ...TAB_WHERE[query.tab],
         AND: [
            ...(query.accountId ? [{ links: { some: { accountId: query.accountId } } }] : []),
            ...(query.filters ? peopleWhere(query.filters) : []),
         ],
         ...(query.foundBy ? { foundBy: { has: query.foundBy } } : {}),
         ...(query.fit ? { fit: query.fit } : {}),
         ...(query.label ? { labels: { has: query.label } } : {}),
         ...(query.onlyNew && client.seenAt ? { firstSeenAt: { gt: client.seenAt } } : {}),
         ...(search && 'slug' in search ? { slug: search.slug } : {}),
         ...(matching ? { id: { in: matching } } : {}),
      }
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
         isNew: client.seenAt !== null && row.firstSeenAt > client.seenAt,
      }))

      return {
         items,
         // Capped like the tab counts: COUNT_CAP + 1 reads as "10k+".
         total,
         next: rows.length > query.limit ? skip + query.limit : null,
      }
   }

   // How many people each tab holds, up to COUNT_CAP + 1 ("10k+").
   public static async counts(userId: string, clientId: string) {
      if (!(await ownedClient(userId, clientId))) {
         return null
      }

      const [NEEDS_ME, WAITING, EVERYONE, DO_NOT_CONTACT] = await Promise.all([
         cappedCount(clientId, TAB_SQL.NEEDS_ME),
         cappedCount(clientId, TAB_SQL.WAITING),
         cappedCount(clientId, TAB_SQL.EVERYONE),
         cappedCount(clientId, TAB_SQL.DO_NOT_CONTACT),
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
               cappedCount(client.id, Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.REPLY}`),
               cappedCount(client.id, Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.REQUEST}`),
               INVITES_LIVE
                  ? cappedCount(client.id, Prisma.sql`${TAB_SQL.NEEDS_ME} AND "priority" = ${PRIORITY.INVITE}`)
                  : Promise.resolve(0),
               db.linkedInInvite.count({
                  where: {
                     clientId: client.id,
                     state: { in: ['SENT', 'UNKNOWN'] },
                  },
               }),
               client.seenAt
                  ? cappedCount(client.id, Prisma.sql`NOT "doNotContact" AND "firstSeenAt" > ${client.seenAt}`)
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
      if (!(await ownedClient(userId, clientId))) {
         return null
      }

      const db = PrismaService.client
      const since = new Date(now.getTime() - days * DAY_MS)
      const [newThisWeek, spent, invites] = await Promise.all([
         cappedCount(clientId, Prisma.sql`NOT "doNotContact" AND "firstSeenAt" > ${new Date(now.getTime() - WEEK_MS)}`),
         db.spendLedger.aggregate({
            where: {
               userId,
               clientId,
               month: now.toISOString().slice(0, 7),
            },
            _sum: { amountMicros: true },
         }),
         db.linkedInInvite.findMany({
            where: {
               clientId,
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
               clientId,
               slug: { in: slugs },
               status: 'REPLIED',
            },
            select: { slug: true },
         }),
         db.dataRead.groupBy({
            by: ['slug'],
            where: {
               userId,
               clientId,
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
      const client = await ownedClient(userId, clientId)

      if (!client) {
         return null
      }

      const db = PrismaService.client
      const [countries, companies, labels] = await Promise.all([
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "country" AS "value", count(*) AS "count" FROM "Person"
            WHERE "clientId" = ${client.id} AND "country" IS NOT NULL
            GROUP BY "country" ORDER BY count(*) DESC, "country" LIMIT ${OPTIONS_CAP}`,
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "company" AS "value", count(*) AS "count" FROM "Person"
            WHERE "clientId" = ${client.id} AND "company" IS NOT NULL AND "company" <> ''
            GROUP BY "company" ORDER BY count(*) DESC, "company" LIMIT ${OPTIONS_CAP}`,
         db.$queryRaw<Array<{ value: string; count: bigint }>>`
            SELECT "label" AS "value", count(*) AS "count" FROM "Person", unnest("labels") AS "label"
            WHERE "clientId" = ${client.id}
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

   // The owner left My network on this client: people seen until now are not new any more.
   public static async seen(userId: string, clientId: string) {
      const { count } = await PrismaService.client.client.updateMany({
         where: {
            id: clientId,
            userId,
         },
         data: { seenAt: new Date() },
      })

      return count === 1
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

   // The same changes to many people of one client at once. Resolves to how many changed.
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
            clientId,
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
            WHERE "id" = ANY(${ids}) AND "userId" = ${userId} AND "clientId" = ${clientId}`
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

   // Adds pasted profile links to a list of the client, made in the same step when named. People already in a list or the
   // targets, and people on Do not contact, are skipped with a count; nothing is read or charged.
   public static async add(
      userId: string,
      clientId: string,
      links: LinkedInLink[],
      list: { id: string } | { name: string }
   ) {
      const db = PrismaService.client
      const client = await ownedClient(userId, clientId)

      if (!client) {
         return null
      }

      const target =
         'id' in list
            ? await db.workflowList.findFirst({
                 where: {
                    id: list.id,
                    userId,
                 },
                 select: { id: true },
              })
            : await WorkflowListService.createList(userId, list.name)

      if (!target) {
         return null
      }

      if ('name' in list) {
         await db.workflowList.update({
            where: { id: target.id },
            data: { clientId: client.id },
         })
      }

      let added = 0
      let skipped = 0

      for (const link of links) {
         try {
            await WorkflowListService.addMember(userId, target.id, {
               slug: link.slug,
               url: link.url,
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

      return {
         listId: target.id,
         added,
         skipped,
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
      const client = await ownedClient(userId, query.clientId)

      if (!client) {
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
            clientId: client.id,
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
         fileName: `${client.name.replace(/[^\w-]+/g, '-')}-people.csv`,
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
