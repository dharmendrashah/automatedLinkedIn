import { PLATFORM_MAX } from '@automatedLinkedIn/contracts'

import { AccountLimitsService } from './accountLimits.service'
import { COUNTED, PENDING } from './inviteRules'
import { type PendingLevel, pendingLevel } from './limits'
import { PrismaService } from './prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export type Room = { limit: number; used: number }

// What an account may still do today and what it did (.plan/lead-pipeline-p1-foundations.md). Counts keep their windows: a rolling 24 hours
// and a rolling 7 days. Reactions and comments count the acts that were asked for in the last 24 hours and the ones still queued.
export type AccountRoom = {
   accountId: string
   invites: Room
   invitesWeek: Room
   firstMessages: Room
   replies: Room
   reactions: Room
   comments: Room
   pending: { count: number; share: number; level: PendingLevel }
}

const countsBy = (rows: Array<{ accountId: string; _count: { _all: number } }>) =>
   new Map(rows.map(({ accountId, _count }) => [accountId, _count._all]))

export const roomOf = (limit: number, used: number): Room => ({
   limit,
   used,
})

// The room left on a measure, never below 0: a limit that shrank overnight does not make it negative.
export const roomLeft = ({ limit, used }: Room) => Math.max(0, limit - used)

export class AccountRoomService {
   // The limits, what was used and the pending invites of each of the accounts. An account that does not exist has no entry.
   public static async forAccounts(accountIds: string[], now = new Date()): Promise<Map<string, AccountRoom>> {
      const db = PrismaService.client
      const day = new Date(now.getTime() - DAY_MS)
      const week = new Date(now.getTime() - WEEK_MS)
      const [limits, invitesDay, invitesWeek, first, replies, pending, acts] = await Promise.all([
         AccountLimitsService.forAccounts(
            accountIds,
            [
               'invitesPerDay',
               'invitesPerWeek',
               'firstMessagesPerDay',
               'repliesPerDay',
               'reactionsPerDay',
               'commentsPerDay',
            ],
            now
         ),
         db.linkedInInvite.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: accountIds },
               state: { in: COUNTED },
               startedAt: { gte: day },
            },
            _count: { _all: true },
         }),
         db.linkedInInvite.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: accountIds },
               state: { in: COUNTED },
               startedAt: { gte: week },
            },
            _count: { _all: true },
         }),
         db.linkedInReply.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: accountIds },
               recipientSlug: { not: null },
               state: { in: ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN'] },
               createdAt: { gte: day },
            },
            _count: { _all: true },
         }),
         // Replies count whether or not they begin a conversation: the same count the reply queue refuses at.
         db.linkedInReply.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: accountIds },
               state: { in: ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN'] },
               createdAt: { gte: day },
            },
            _count: { _all: true },
         }),
         db.linkedInInvite.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: accountIds },
               state: { in: PENDING },
            },
            _count: { _all: true },
         }),
         // Acts asked for in the last 24 hours (pressed, done or unsure) and the ones still queued.
         db.postAct.groupBy({
            by: ['accountId', 'act'],
            where: {
               accountId: { in: accountIds },
               OR: [
                  { state: 'QUEUED' },
                  {
                     state: { in: ['SENDING', 'DONE', 'UNKNOWN'] },
                     startedAt: { gte: day },
                  },
               ],
            },
            _count: { _all: true },
         }),
      ])
      const actsBy = (accountId: string, act: 'REACT' | 'COMMENT') =>
         acts.find(row => row.accountId === accountId && row.act === act)?._count._all ?? 0
      const invitesDayBy = countsBy(invitesDay)
      const invitesWeekBy = countsBy(invitesWeek)
      const firstBy = countsBy(first)
      const repliesBy = countsBy(replies)
      const pendingBy = countsBy(pending)

      return new Map(
         [...limits].map(([accountId, own]) => {
            const count = pendingBy.get(accountId) ?? 0

            return [
               accountId,
               {
                  accountId,
                  invites: roomOf(own.invitesPerDay, invitesDayBy.get(accountId) ?? 0),
                  invitesWeek: roomOf(own.invitesPerWeek, invitesWeekBy.get(accountId) ?? 0),
                  firstMessages: roomOf(own.firstMessagesPerDay, firstBy.get(accountId) ?? 0),
                  replies: roomOf(own.repliesPerDay, repliesBy.get(accountId) ?? 0),
                  reactions: roomOf(own.reactionsPerDay, actsBy(accountId, 'REACT')),
                  comments: roomOf(own.commentsPerDay, actsBy(accountId, 'COMMENT')),
                  pending: {
                     count,
                     share: count / PLATFORM_MAX.pendingInvites,
                     level: pendingLevel(count),
                  },
               },
            ]
         })
      )
   }

   // The same for every account of an owner, oldest first.
   public static async forUser(userId: string, now = new Date()): Promise<AccountRoom[]> {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: { id: true },
      })
      const rooms = await this.forAccounts(
         accounts.map(({ id }) => id),
         now
      )

      return accounts.flatMap(({ id }) => rooms.get(id) ?? [])
   }
}
