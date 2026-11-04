import { type Health, healthOf } from '@automatedLinkedIn/contracts'

import { AccountRoomService } from './accountRoom.service'
import { PrismaService } from './prisma.service'

// How each of the owner's accounts is doing, in one word and the reasons under it (.plan/lead-pipeline-p5-campaign-page.md). It reads what
// the earlier phases keep and keeps nothing; the word never says "safe".

const DAY_MS = 24 * 60 * 60 * 1000

// Stopped until a time, or until a sign-in after it stopped.
const stoppedNow = (at: Date | null, until: Date | null, verifiedAt: Date | null, now: Date) =>
   at === null ? false : until ? until > now : !(verifiedAt && verifiedAt > at)

export type AccountHealth = {
   accountId: string
   name: string
   status: string
   health: Health
   reasons: string[]
   invites: { limit: number; used: number }
   pending: { count: number; share: number }
}

const countBy = (rows: Array<{ accountId: string; _count: { _all: number } }>) =>
   new Map(rows.map(({ accountId, _count }) => [accountId, _count._all]))

export class FleetHealthService {
   public static async forUser(userId: string, now = new Date()): Promise<AccountHealth[]> {
      const db = PrismaService.client
      const accounts = await db.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            statusUpdatedAt: true,
            lastVerifiedAt: true,
            invitesStoppedAt: true,
            invitesStopUntil: true,
            engageStoppedAt: true,
            engageStopUntil: true,
         },
      })
      const ids = accounts.map(({ id }) => id)
      const [rooms, ...counts] = await Promise.all([
         AccountRoomService.forAccounts(ids, now),
         ...[
            {
               from: 14,
               to: 0,
               accepted: false,
            },
            {
               from: 14,
               to: 0,
               accepted: true,
            },
            {
               from: 28,
               to: 14,
               accepted: false,
            },
            {
               from: 28,
               to: 14,
               accepted: true,
            },
         ].map(({ from, to, accepted }) =>
            db.linkedInInvite.groupBy({
               by: ['accountId'],
               where: {
                  accountId: { in: ids },
                  invitedAt: {
                     gte: new Date(now.getTime() - from * DAY_MS),
                     lt: new Date(now.getTime() - to * DAY_MS + 1),
                  },
                  ...(accepted && { acceptedAt: { not: null } }),
               },
               _count: { _all: true },
            })
         ),
         db.postAct.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: ids },
               state: 'UNKNOWN',
               startedAt: { gte: new Date(now.getTime() - DAY_MS) },
            },
            _count: { _all: true },
         }),
         db.linkedInInvite.groupBy({
            by: ['accountId'],
            where: {
               accountId: { in: ids },
               state: 'UNKNOWN',
               invitedAt: { gte: new Date(now.getTime() - DAY_MS) },
            },
            _count: { _all: true },
         }),
      ])
      const [now14, accepted14, before14, acceptedBefore, unknownActs, unknownInvites] = counts.map(countBy)

      return accounts.map(account => {
         const room = rooms.get(account.id)
         const pending = room?.pending.count ?? 0
         const { word, reasons } = healthOf({
            status: account.status,
            invitesStopped: stoppedNow(account.invitesStoppedAt, account.invitesStopUntil, account.lastVerifiedAt, now),
            engageStopped: stoppedNow(account.engageStoppedAt, account.engageStopUntil, account.lastVerifiedAt, now),
            pending,
            invitesNow: now14?.get(account.id) ?? 0,
            acceptedNow: accepted14?.get(account.id) ?? 0,
            invitesBefore: before14?.get(account.id) ?? 0,
            acceptedBefore: acceptedBefore?.get(account.id) ?? 0,
            troubleActs: (unknownActs?.get(account.id) ?? 0) + (unknownInvites?.get(account.id) ?? 0),
            signedOutRecently:
               ['NEEDS_REAUTH', 'ERROR', 'BLOCKED'].includes(account.status) &&
               account.statusUpdatedAt.getTime() > now.getTime() - 7 * DAY_MS,
         })

         return {
            accountId: account.id,
            name: account.displayName ?? account.email,
            status: account.status,
            health: word,
            reasons,
            invites: room?.invites ?? {
               limit: 0,
               used: 0,
            },
            pending: {
               count: pending,
               share: room?.pending.share ?? 0,
            },
         }
      })
   }
}
