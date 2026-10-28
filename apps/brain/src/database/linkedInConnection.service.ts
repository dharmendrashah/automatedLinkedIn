import { CONNECTION_LIMITS, type ConnectionsFile } from '@automatedLinkedIn/contracts'

import { type ConnectionStatus, planStore } from './connectionRules'
import { CONNECTIONS_TASK } from './linkedInConnection.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskBusyError, TaskRefusedError } from './taskErrors'

const DAY_MS = 24 * 60 * 60 * 1000
// The task's own limit is 25 minutes; a run that began longer ago than this and never ended is not reading any more.
const READING_STALE_MS = 30 * 60 * 1000
// A removal still on its way after this long was lost with its run. It may have been done, so it is unsure, never failed.
const STALE_MS = 45 * 60 * 1000
const STALE_SENTENCE = 'No answer came from the browser. Check on LinkedIn.'
// How many connections the page gets back: the ones on the list, and the newest that are over. A read keeps at most a thousand.
const OPEN_LIMIT = 1000
const OVER_LIMIT = 200

// The states the owner sees; the stored `UNKNOWN` is UNSURE.
export type ConnectionState = 'CONNECTED' | 'REMOVING' | 'REMOVED' | 'GONE' | 'UNSURE' | 'FAILED'

export type ConnectionView = {
   id: string
   slug: string
   name: string
   headline: string
   // YYYY-MM-DD, when the page said it.
   connectedOn?: string
   photoUrl?: string
   // LinkedIn's number of the member, for opening its message window.
   messageUrn?: string
   // The Unibox conversation the account has with this person, when it has one.
   conversationId?: string
   state: ConnectionState
   startedAt?: string
   removedAt?: string
   failure?: string
}

// What the page needs of the account it asked for.
export type ConnectionAccountView = {
   accountId: string
   // How many connections LinkedIn says the account has, or how many were read when it did not say.
   total: number
   readAt: string | null
   reading: boolean
   removedToday: number
   removeLeft: number
   problem?: 'SIGNED_OUT'
}

export type ConnectionList = {
   account: ConnectionAccountView
   connections: ConnectionView[]
   // The list was cut at the limits above.
   cut: boolean
}

const STATES: Record<ConnectionStatus, ConnectionState> = {
   CONNECTED: 'CONNECTED',
   REMOVING: 'REMOVING',
   REMOVED: 'REMOVED',
   GONE: 'GONE',
   UNKNOWN: 'UNSURE',
   FAILED: 'FAILED',
}

const SELECT = {
   id: true,
   slug: true,
   name: true,
   headline: true,
   connectedOn: true,
   photoUrl: true,
   messageUrn: true,
   status: true,
   startedAt: true,
   removedAt: true,
   failure: true,
} as const

type Row = {
   id: string
   slug: string
   name: string
   headline: string
   connectedOn: Date | null
   photoUrl: string | null
   messageUrn: string | null
   status: ConnectionStatus
   startedAt: Date | null
   removedAt: Date | null
   failure: string | null
}

const viewOf = (row: Row, conversationOf: (slug: string) => string | undefined): ConnectionView => {
   const conversationId = conversationOf(row.slug)

   return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      headline: row.headline,
      ...(row.connectedOn && { connectedOn: row.connectedOn.toISOString().slice(0, 10) }),
      ...(row.photoUrl && { photoUrl: row.photoUrl }),
      ...(row.messageUrn && { messageUrn: row.messageUrn }),
      ...(conversationId && { conversationId }),
      state: STATES[row.status],
      ...(row.startedAt && { startedAt: row.startedAt.toISOString() }),
      ...(row.removedAt && { removedAt: row.removedAt.toISOString() }),
      ...(row.failure && { failure: row.failure }),
   }
}

// A profile address as the conversation and the connection each wrote it may differ in percent signs, so both are compared decoded.
const keyOf = (slug: string) => {
   try {
      return decodeURIComponent(slug).toLowerCase()
   } catch {
      return slug.toLowerCase()
   }
}

const SLUG = /\/in\/([^/?#]+)/

// One person of one account.
const pairKey = (accountId: string, slug: string) => `${accountId}\u0000${keyOf(slug)}`

// How many connections New message gets back for one search; the page orders them.
const RECIPIENTS_LIMIT = 200

// A connection of one of the owner's accounts, as New message lists it.
export type RecipientView = {
   accountId: string
   slug: string
   name: string
   headline: string
   imageUrl?: string
   conversationId?: string
   blocked?: 'DO_NOT_CONTACT'
}

const ownAccount = (userId: string, accountId: string) =>
   PrismaService.client.linkedInAccount.findFirst({
      where: {
         id: accountId,
         userId,
      },
      select: {
         status: true,
         connectionsReadAt: true,
         connectionsTotal: true,
      },
   })

// A removal that was asked for counts against the day, and so does one that may have gone through.
const COUNTED: ConnectionStatus[] = ['REMOVING', 'REMOVED', 'UNKNOWN']

// The connections of an owner's account: what the last read found, the removal asked for, and the two things the page can ask, a read
// and a removal (.plan/my-connections.md). Every call is scoped to the owner, so a foreign account or connection answers like a missing
// one (null).
export class LinkedInConnectionService {
   // The Unibox conversation each account has with each person it has one with, by `pairKey`. Only accounts still the owner's count.
   private static async conversationsOf(userId: string, accountIds: string[]) {
      const rows = await PrismaService.client.linkedInConversation.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            account: { userId },
            kind: 'DIRECT',
         },
         orderBy: {
            lastMessageAt: {
               sort: 'desc',
               nulls: 'last',
            },
         },
         select: {
            id: true,
            accountId: true,
            participants: true,
         },
      })
      const found = new Map<string, string>()

      for (const { id, accountId, participants } of rows) {
         for (const person of Array.isArray(participants) ? (participants as unknown[]) : []) {
            const { profileUrl } = (person ?? {}) as { profileUrl?: unknown }
            const [, slug] = SLUG.exec(typeof profileUrl === 'string' ? profileUrl : '') ?? []

            if (slug && !found.has(pairKey(accountId, slug))) {
               found.set(pairKey(accountId, slug), id)
            }
         }
      }

      return found
   }

   // The connections of every account of the owner that match all the words (in the name, title or profile name), for New message:
   // with the conversation the account has with each, and the do-not-contact mark. Removed and gone connections are left out.
   public static async recipients(userId: string, query: string): Promise<RecipientView[]> {
      const db = PrismaService.client
      const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5)
      const rows = await db.linkedInConnection.findMany({
         where: {
            userId,
            account: { userId },
            status: { notIn: ['REMOVED', 'GONE'] },
            AND: words.map(word => ({
               OR: [
                  {
                     name: {
                        contains: word,
                        mode: 'insensitive' as const,
                     },
                  },
                  {
                     headline: {
                        contains: word,
                        mode: 'insensitive' as const,
                     },
                  },
                  {
                     slug: {
                        contains: word,
                        mode: 'insensitive' as const,
                     },
                  },
               ],
            })),
         },
         orderBy: [{ accountId: 'asc' }, { position: 'asc' }],
         take: RECIPIENTS_LIMIT,
         select: {
            accountId: true,
            slug: true,
            name: true,
            headline: true,
            photoUrl: true,
         },
      })

      if (rows.length === 0) {
         return []
      }

      const [conversations, suppressed] = await Promise.all([
         this.conversationsOf(userId, [...new Set(rows.map(({ accountId }) => accountId))]),
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: [...new Set(rows.flatMap(({ slug }) => [slug, keyOf(slug)]))] },
            },
            select: { slug: true },
         }),
      ])
      const blocked = new Set(suppressed.map(({ slug }) => keyOf(slug)))

      return rows.map(row => {
         const conversationId = conversations.get(pairKey(row.accountId, row.slug))

         return {
            accountId: row.accountId,
            slug: row.slug,
            name: row.name,
            headline: row.headline,
            ...(row.photoUrl && { imageUrl: row.photoUrl }),
            ...(conversationId && { conversationId }),
            ...(blocked.has(keyOf(row.slug)) && { blocked: 'DO_NOT_CONTACT' as const }),
         }
      })
   }

   // What the page shows for the account it asked for: the connections on its list in LinkedIn's order, then the newest that are over,
   // and how the account stands. Null when the account is not the owner's.
   public static async list(userId: string, accountId: string): Promise<ConnectionList | null> {
      const db = PrismaService.client
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      const [open, over, counted, session, conversations] = await Promise.all([
         db.linkedInConnection.findMany({
            where: {
               accountId,
               userId,
               status: { notIn: ['REMOVED', 'GONE'] },
            },
            orderBy: { position: 'asc' },
            take: OPEN_LIMIT + 1,
            select: SELECT,
         }),
         db.linkedInConnection.findMany({
            where: {
               accountId,
               userId,
               status: { in: ['REMOVED', 'GONE'] },
            },
            orderBy: [
               {
                  removedAt: {
                     sort: 'desc',
                     nulls: 'last',
                  },
               },
               { seenAt: 'desc' },
            ],
            take: OVER_LIMIT + 1,
            select: SELECT,
         }),
         db.linkedInConnection.count({
            where: {
               accountId,
               status: { in: COUNTED },
               startedAt: { gte: new Date(Date.now() - DAY_MS) },
            },
         }),
         db.spiderSession.findFirst({
            where: {
               linkedInAccountId: accountId,
               task: CONNECTIONS_TASK,
               kind: 'TASK',
            },
            orderBy: { startedAt: 'desc' },
            select: {
               status: true,
               startedAt: true,
               connectionImport: { select: { status: true } },
               _count: { select: { connections: true } },
            },
         }),
         this.conversationsOf(userId, [accountId]),
      ])
      // A read, not a removal: the run is going, or its file waits to be stored. A removal run shows as a REMOVING row instead.
      const running = session?.status === 'IN_PROGRESS' && Date.now() - session.startedAt.getTime() < READING_STALE_MS
      const stored =
         session !== undefined &&
         session !== null &&
         session.status !== 'IN_PROGRESS' &&
         session.connectionImport?.status === 'PENDING'
      const shown = open.slice(0, OPEN_LIMIT).filter(({ status }) => status === 'CONNECTED').length

      return {
         account: {
            accountId,
            total: account.connectionsTotal ?? shown,
            readAt: account.connectionsReadAt?.toISOString() ?? null,
            reading: session !== null && (running || stored) && session._count.connections === 0,
            removedToday: counted,
            removeLeft: Math.max(0, CONNECTION_LIMITS.removePerDay - counted),
            ...(account.status !== 'ACTIVE' && { problem: 'SIGNED_OUT' as const }),
         },
         connections: [...open.slice(0, OPEN_LIMIT), ...over.slice(0, OVER_LIMIT)].map(row =>
            viewOf(row, slug => conversations.get(pairKey(accountId, slug)))
         ),
         cut: open.length > OPEN_LIMIT || over.length > OVER_LIMIT,
      }
   }

   // Asks the spider to read the connections of the account. Null when it is not the owner's. An account that is not signed in, or that
   // the browse budget refuses now, is refused with its sentence (the budget one the owner may go past with `startAnyway`); one that is
   // already being read or worked on counts as asked: its run reads the list too.
   public static async refresh(userId: string, accountId: string, startAnyway?: boolean) {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      this.mustBeActive(account.status)

      try {
         await TaskService.request({
            userId,
            task: CONNECTIONS_TASK,
            accountId,
            trigger: 'manual',
            input: {},
            startAnyway,
         })
      } catch (error) {
         if (!(error instanceof TaskBusyError)) {
            throw error
         }
      }

      return { started: true as const }
   }

   // Asks the spider to remove one connection, by its address. One at a time, a few a day, with a rest between two; the connection moves
   // to REMOVING in the same transaction that saves the run, so it is never asked for twice. Null for an account or a connection that
   // is not the owner's.
   public static async remove(userId: string, accountId: string, id: string, startAnyway?: boolean) {
      const db = PrismaService.client
      const account = await ownAccount(userId, accountId)
      const row = await db.linkedInConnection.findFirst({
         where: {
            id,
            userId,
            accountId,
         },
         select: {
            slug: true,
            status: true,
         },
      })

      if (!account || !row) {
         return null
      }

      this.mustBeActive(account.status)

      if (row.status !== 'CONNECTED') {
         throw new TaskRefusedError('This connection is not on the list any more. Read the connections again.')
      }

      await this.mustHaveRoom(accountId)

      await TaskService.request({
         userId,
         task: CONNECTIONS_TASK,
         accountId,
         trigger: 'manual',
         input: { remove: row.slug },
         startAnyway,
         onStart: async (sessionId, tx) => {
            const { count } = await tx.linkedInConnection.updateMany({
               where: {
                  id,
                  userId,
                  status: 'CONNECTED',
               },
               data: {
                  status: 'REMOVING',
                  sessionId,
                  startedAt: new Date(),
                  failure: null,
               },
            })

            // Another call took it first: the run is not saved, and nothing is asked for twice.
            if (count === 0) {
               throw new TaskRefusedError('This connection is not on the list any more. Read the connections again.')
            }
         },
      })

      return { started: true as const }
   }

   // Stores what a finished run read, for the owner and the account of its session (both come from the session row, never from the
   // file). Idempotent: reading the same file again changes nothing more.
   public static async store(
      owner: { userId: string; accountId: string },
      file: ConnectionsFile,
      session: { id: string; verdict: string | null }
   ) {
      const db = PrismaService.client
      const now = new Date()
      const known = await db.linkedInConnection.findMany({
         where: { accountId: owner.accountId },
         select: {
            id: true,
            slug: true,
            status: true,
            sessionId: true,
         },
      })
      const changes = planStore(known, file, {
         sessionId: session.id,
         verdict: session.verdict,
         now,
      })

      await db.$transaction(
         async tx => {
            for (const { id, connection, data } of changes) {
               const shown = connection && {
                  name: connection.name,
                  headline: connection.headline,
                  connectedOn: connection.connectedOn ? new Date(`${connection.connectedOn}T00:00:00Z`) : null,
                  photoUrl: connection.photoUrl ?? null,
                  messageUrn: connection.messageUrn ?? null,
                  position: connection.position,
                  seenAt: now,
               }

               if (id) {
                  await tx.linkedInConnection.update({
                     where: { id },
                     data: {
                        ...shown,
                        ...data,
                     },
                  })
               } else if (connection && shown) {
                  await tx.linkedInConnection.create({
                     data: {
                        userId: owner.userId,
                        accountId: owner.accountId,
                        slug: connection.slug,
                        ...shown,
                     },
                  })
               }
            }

            // A run that removed one read only the top of the list: it says nothing of when the list was last read in full, and its
            // count is of the list before the removal.
            if (file.removal === undefined) {
               await tx.linkedInAccount.update({
                  where: { id: owner.accountId },
                  data: {
                     connectionsReadAt: new Date(file.captured_at),
                     connectionsTotal: file.total ?? null,
                  },
               })
            } else if (file.removal.outcome === 'REMOVED' && file.total !== undefined) {
               await tx.linkedInAccount.update({
                  where: { id: owner.accountId },
                  data: { connectionsTotal: Math.max(0, file.total - 1) },
               })
            }
         },
         { timeout: 60_000 }
      )

      return changes.length
   }

   // A removal still on its way long after its run could have ended was lost with it. It may have been done, so it is unsure, never
   // failed. Resolves to how many were ended.
   public static async endStale(now = new Date()) {
      const { count } = await PrismaService.client.linkedInConnection.updateMany({
         where: {
            status: 'REMOVING',
            startedAt: { lt: new Date(now.getTime() - STALE_MS) },
         },
         data: {
            status: 'UNKNOWN',
            failure: STALE_SENTENCE,
         },
      })

      return count
   }

   // The day's removals, and the rest between two (the contract's numbers): refused at once with the time to wait.
   private static async mustHaveRoom(accountId: string, now = Date.now()) {
      const db = PrismaService.client
      const used = await db.linkedInConnection.count({
         where: {
            accountId,
            status: { in: COUNTED },
            startedAt: { gte: new Date(now - DAY_MS) },
         },
      })

      if (used >= CONNECTION_LIMITS.removePerDay) {
         throw new TaskRefusedError('This account has used its removals for today. It can remove again tomorrow.')
      }

      const last = await db.linkedInConnection.findFirst({
         where: {
            accountId,
            status: { in: COUNTED },
            startedAt: { gte: new Date(now - CONNECTION_LIMITS.removeGapSeconds * 1000) },
         },
         orderBy: { startedAt: 'desc' },
         select: { startedAt: true },
      })

      if (last?.startedAt) {
         const wait = Math.ceil((last.startedAt.getTime() + CONNECTION_LIMITS.removeGapSeconds * 1000 - now) / 1000)

         throw new TaskRefusedError(`Wait ${Math.max(1, wait)} seconds before removing another connection.`)
      }
   }

   private static mustBeActive(status: string) {
      if (status !== 'ACTIVE') {
         throw new TaskRefusedError('Connections need an account that is signed in. Run Test login first.')
      }
   }
}
