import { INVITATION_LIMITS, type InvitationAction, type InvitationsFile } from '@automatedLinkedIn/contracts'

import { type InvitationStatus, planStore } from './invitationRules'
import { INVITATIONS_TASK } from './linkedInInvitation.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

const DAY_MS = 24 * 60 * 60 * 1000
// The task's own limit is 8 minutes; a run that began longer ago than this and never ended is not reading any more.
const READING_STALE_MS = 15 * 60 * 1000
// A request still queued after this long was lost with its run. It may have been answered, so it is unsure, never failed.
const STALE_MS = 30 * 60 * 1000
const STALE_SENTENCE = 'No answer came from the browser. Check on LinkedIn.'
// How many requests that are over the page gets back with the waiting ones.
const OVER_LIMIT = 100

// The states the owner sees; the stored `PENDING` is WAITING and `UNKNOWN` is UNSURE.
export type InvitationState = 'WAITING' | 'QUEUED' | 'ACCEPTED' | 'IGNORED' | 'GONE' | 'UNSURE' | 'FAILED'

export type InvitationView = {
   id: string
   slug: string
   name: string
   headline: string
   mutual?: string
   note?: string
   photoUrl?: string
   state: InvitationState
   action?: InvitationAction
   startedAt?: string
   answeredAt?: string
   failure?: string
}

export type InvitationSnapshot = {
   requests: InvitationView[]
   total: number
   readAt: string | null
   reading: boolean
   answeredToday: number
   problem?: 'SIGNED_OUT'
}

const STATES: Record<InvitationStatus, InvitationState> = {
   PENDING: 'WAITING',
   QUEUED: 'QUEUED',
   ACCEPTED: 'ACCEPTED',
   IGNORED: 'IGNORED',
   GONE: 'GONE',
   UNKNOWN: 'UNSURE',
   FAILED: 'FAILED',
}

const SELECT = {
   id: true,
   slug: true,
   name: true,
   headline: true,
   mutual: true,
   note: true,
   photoUrl: true,
   status: true,
   action: true,
   startedAt: true,
   answeredAt: true,
   failure: true,
} as const

type Row = {
   id: string
   slug: string
   name: string
   headline: string
   mutual: string | null
   note: string | null
   photoUrl: string | null
   status: InvitationStatus
   action: InvitationAction | null
   startedAt: Date | null
   answeredAt: Date | null
   failure: string | null
}

// LinkedIn's own number of a request is never sent to the page; the page and its calls use brain's id.
const viewOf = (row: Row): InvitationView => ({
   id: row.id,
   slug: row.slug,
   name: row.name,
   headline: row.headline,
   ...(row.mutual && { mutual: row.mutual }),
   ...(row.note && { note: row.note }),
   ...(row.photoUrl && { photoUrl: row.photoUrl }),
   state: STATES[row.status],
   ...(row.action && { action: row.action }),
   ...(row.startedAt && { startedAt: row.startedAt.toISOString() }),
   ...(row.answeredAt && { answeredAt: row.answeredAt.toISOString() }),
   ...(row.failure && { failure: row.failure }),
})

const ownAccount = (userId: string, accountId: string) =>
   PrismaService.client.linkedInAccount.findFirst({
      where: {
         id: accountId,
         userId,
      },
      select: {
         status: true,
         invitationsReadAt: true,
         invitationsTotal: true,
      },
   })

// A request that was answered or is being answered counts against the day, and so does one that may have been.
const COUNTED: InvitationStatus[] = ['QUEUED', 'ACCEPTED', 'IGNORED', 'UNKNOWN']

// The connection requests of an owner's accounts: what the last read found, the answers asked for, and the two things the page can
// ask, a read and a set of answers (.plan/my-network-invitations.md). Every call is scoped to the owner, so a foreign account or
// request answers like a missing one (null).
export class LinkedInInvitationService {
   // How many requests wait for each of the owner's accounts, for the account list.
   public static async waiting(userId: string, accountIds: string[]) {
      const groups = await PrismaService.client.linkedInInvitation.groupBy({
         by: ['accountId'],
         where: {
            userId,
            accountId: { in: accountIds },
            status: { in: ['PENDING', 'QUEUED'] },
         },
         _count: { _all: true },
      })

      return Object.fromEntries(groups.map(group => [group.accountId, group._count._all]))
   }

   // What the page shows for one account: the waiting requests in LinkedIn's order, then the newest that are over.
   public static async snapshot(userId: string, accountId: string): Promise<InvitationSnapshot | null> {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      const db = PrismaService.client
      const [open, over, answeredToday, latest] = await Promise.all([
         db.linkedInInvitation.findMany({
            where: {
               accountId,
               userId,
               status: { in: ['PENDING', 'QUEUED'] },
            },
            orderBy: { position: 'asc' },
            take: 200,
            select: SELECT,
         }),
         db.linkedInInvitation.findMany({
            where: {
               accountId,
               userId,
               status: { notIn: ['PENDING', 'QUEUED'] },
            },
            orderBy: [
               {
                  answeredAt: {
                     sort: 'desc',
                     nulls: 'last',
                  },
               },
               { seenAt: 'desc' },
            ],
            take: OVER_LIMIT,
            select: SELECT,
         }),
         this.answeredToday(accountId),
         db.spiderSession.findFirst({
            where: {
               linkedInAccountId: accountId,
               task: INVITATIONS_TASK,
               kind: 'TASK',
            },
            orderBy: { startedAt: 'desc' },
            select: {
               status: true,
               startedAt: true,
               invitationImport: { select: { status: true } },
               _count: { select: { invitations: true } },
            },
         }),
      ])
      // A read, not an answer: the run is going, or its file waits to be stored. An answer run shows as QUEUED rows instead.
      const running = latest?.status === 'IN_PROGRESS' && Date.now() - latest.startedAt.getTime() < READING_STALE_MS
      const stored = latest !== null && latest.status !== 'IN_PROGRESS' && latest.invitationImport?.status === 'PENDING'
      const waiting = open.filter(({ status }) => status === 'PENDING').length

      return {
         requests: [...open, ...over].map(viewOf),
         total: account.invitationsTotal ?? waiting,
         readAt: account.invitationsReadAt?.toISOString() ?? null,
         reading: (running || stored) && latest._count.invitations === 0,
         answeredToday,
         ...(account.status !== 'ACTIVE' && { problem: 'SIGNED_OUT' as const }),
      }
   }

   // Asks the spider to read the requests. Null for an account that is not the owner's; a refusal is a TaskRefusedError with a
   // sentence (not signed in, busy, outside the account's hours: the last one the owner may go past with `startAnyway`).
   public static async refresh(userId: string, accountId: string, startAnyway?: boolean) {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      this.mustBeActive(account.status)
      await TaskService.request({
         userId,
         task: INVITATIONS_TASK,
         accountId,
         trigger: 'manual',
         input: { answers: [] },
         startAnyway,
      })

      return { started: true }
   }

   // Asks the spider to answer these requests, in this order, at most `perRun` at a time and `perDay` for the account in 24 hours.
   // The requests move to QUEUED in the same transaction that saves the run, so a request is never asked for twice. Null for an
   // account or a request that is not the owner's.
   public static async answer(
      userId: string,
      accountId: string,
      asks: Array<{ id: string; action: InvitationAction }>,
      startAnyway?: boolean
   ) {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      const ids = [...new Set(asks.map(({ id }) => id))]

      if (asks.length === 0 || ids.length !== asks.length) {
         throw new TaskRefusedError('Choose each request once.')
      }

      if (asks.length > INVITATION_LIMITS.perRun) {
         throw new TaskRefusedError(`At most ${INVITATION_LIMITS.perRun} requests can be answered at a time.`)
      }

      const rows = await PrismaService.client.linkedInInvitation.findMany({
         where: {
            id: { in: ids },
            userId,
            accountId,
         },
         select: {
            id: true,
            linkedInId: true,
            status: true,
         },
      })

      if (rows.length !== ids.length) {
         return null
      }

      this.mustBeActive(account.status)

      if (rows.some(({ status }) => status !== 'PENDING')) {
         throw new TaskRefusedError('Some of these requests are not waiting any more. Read the requests again.')
      }

      const left = Math.max(0, INVITATION_LIMITS.perDay - (await this.answeredToday(accountId)))

      if (asks.length > left) {
         throw new TaskRefusedError(
            left === 0
               ? 'This account has used its answers for today. It can answer again tomorrow.'
               : `This account can answer ${left} more today.`
         )
      }

      const linkedInIds = new Map(rows.map(({ id, linkedInId }) => [id, linkedInId]))

      await TaskService.request({
         userId,
         task: INVITATIONS_TASK,
         accountId,
         trigger: 'manual',
         input: {
            answers: asks.map(({ id, action }) => ({
               id: linkedInIds.get(id),
               action,
            })),
         },
         startAnyway,
         onStart: async (sessionId, tx) => {
            for (const { id, action } of asks) {
               const { count } = await tx.linkedInInvitation.updateMany({
                  where: {
                     id,
                     userId,
                     status: 'PENDING',
                  },
                  data: {
                     status: 'QUEUED',
                     action,
                     sessionId,
                     startedAt: new Date(),
                     failure: null,
                  },
               })

               // Another call took it first: the run is not saved, and nothing is asked for twice.
               if (count === 0) {
                  throw new TaskRefusedError(
                     'Some of these requests are not waiting any more. Read the requests again.'
                  )
               }
            }
         },
      })

      return { started: asks.length }
   }

   // Stores what a finished run read, for the owner and the account of its session (both come from the session row, never from the
   // file). Idempotent: reading the same file again changes nothing more.
   public static async store(
      owner: { userId: string; accountId: string },
      file: InvitationsFile,
      session: { id: string; verdict: string | null }
   ) {
      const db = PrismaService.client
      const now = new Date()
      const known = await db.linkedInInvitation.findMany({
         where: { accountId: owner.accountId },
         select: {
            id: true,
            linkedInId: true,
            status: true,
            action: true,
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
            for (const { id, invitation, data } of changes) {
               const shown = invitation && {
                  slug: invitation.slug,
                  name: invitation.name,
                  headline: invitation.headline,
                  mutual: invitation.mutual ?? null,
                  note: invitation.note ?? null,
                  photoUrl: invitation.photoUrl ?? null,
                  position: invitation.position,
                  seenAt: now,
               }

               if (id) {
                  await tx.linkedInInvitation.update({
                     where: { id },
                     data: {
                        ...shown,
                        ...data,
                     },
                  })
               } else if (invitation && shown) {
                  await tx.linkedInInvitation.create({
                     data: {
                        userId: owner.userId,
                        accountId: owner.accountId,
                        linkedInId: invitation.id,
                        ...shown,
                     },
                  })
               }
            }

            await tx.linkedInAccount.update({
               where: { id: owner.accountId },
               data: {
                  invitationsReadAt: new Date(file.captured_at),
                  invitationsTotal: file.total ?? null,
               },
            })
         },
         { timeout: 30_000 }
      )

      return changes.length
   }

   // A request still queued long after its run could have ended was lost with it. It may have been answered, so it is unsure, never
   // failed. Resolves to how many were ended.
   public static async endStale(now = new Date()) {
      const { count } = await PrismaService.client.linkedInInvitation.updateMany({
         where: {
            status: 'QUEUED',
            startedAt: { lt: new Date(now.getTime() - STALE_MS) },
         },
         data: {
            status: 'UNKNOWN',
            failure: STALE_SENTENCE,
         },
      })

      return count
   }

   private static answeredToday(accountId: string, now = Date.now()) {
      return PrismaService.client.linkedInInvitation.count({
         where: {
            accountId,
            status: { in: COUNTED },
            startedAt: { gte: new Date(now - DAY_MS) },
         },
      })
   }

   private static mustBeActive(status: string) {
      if (status !== 'ACTIVE') {
         throw new TaskRefusedError('Connection requests need an account that is signed in. Run Test login first.')
      }
   }
}
