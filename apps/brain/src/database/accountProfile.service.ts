import { type AccountProfile, accountProfileSchema } from '@automatedLinkedIn/contracts'

import { PROFILE_TASK } from './linkedInProfile.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// A run that began longer ago than this and never ended is not reading any more (the task's own limit is 15 minutes).
const READING_STALE_MS = 45 * 60 * 1000

const READ_VERDICTS = ['DONE', 'PARTIAL']

export type ProfileState = {
   // NEVER: nothing read or asked. READING: a run is going, or its file waits to be stored. READY: a profile is stored.
   // FAILED: nothing is stored and the last run did not give one.
   phase: 'NEVER' | 'READING' | 'READY' | 'FAILED'
   capturedAt: string | null
   // The profile was never asked for, so the page may start the first read.
   firstVisit: boolean
   // Why a read cannot start now, in a sentence the owner can read; null when it can.
   blocker: string | null
   lastRun: {
      ok: boolean
      message: string | null
      finishedAt: string | null
   } | null
}

type AccountRow = {
   status: string
   proxyServers: unknown[]
}

const blockerOf = ({ status, proxyServers }: AccountRow) => {
   if (status === 'DISABLED') {
      return 'Resume the account before reading the profile.'
   }

   if (status !== 'ACTIVE') {
      return 'Reading the profile needs an account that is signed in. Run Test login first.'
   }

   return proxyServers.length === 0 ? 'Add a proxy that works first: reads never go out directly.' : null
}

const ownAccount = (userId: string, accountId: string) =>
   PrismaService.client.linkedInAccount.findFirst({
      where: {
         id: accountId,
         userId,
      },
      select: {
         status: true,
         profileAskedAt: true,
         proxyServers: {
            where: { status: { in: ['ACTIVE', 'GEO_MISMATCH'] } },
            select: { id: true },
            take: 1,
         },
      },
   })

// What the page needs to show an account's profile: the stored profile, the state of the read, and the start of the first read
// and of a new one (.plan/account-profile-backend.md). Everything is scoped to the owner; a foreign account answers like a missing one.
export class AccountProfileService {
   // Light on purpose: no profile content, so the page can ask it every few seconds while a read goes on.
   public static async state(userId: string, accountId: string): Promise<ProfileState | null> {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      const [stored, latest] = await Promise.all([
         PrismaService.client.linkedInAccountProfile.findFirst({
            where: {
               accountId,
               userId,
            },
            select: { capturedAt: true },
         }),
         PrismaService.client.spiderSession.findFirst({
            where: {
               linkedInAccountId: accountId,
               task: PROFILE_TASK,
               kind: 'TASK',
            },
            orderBy: { startedAt: 'desc' },
            select: {
               status: true,
               verdict: true,
               message: true,
               startedAt: true,
               finishedAt: true,
               profileImport: { select: { status: true } },
            },
         }),
      ])

      const running = latest?.status === 'IN_PROGRESS' && Date.now() - latest.startedAt.getTime() < READING_STALE_MS
      const waiting = latest !== null && latest.status !== 'IN_PROGRESS' && latest.profileImport?.status === 'PENDING'
      const reading = running || waiting
      const gaveProfile =
         latest !== null &&
         latest.status !== 'IN_PROGRESS' &&
         READ_VERDICTS.includes(latest.verdict ?? '') &&
         latest.profileImport?.status !== 'FAILED'
      const failed = latest !== null && !reading && !gaveProfile

      return {
         phase: reading ? 'READING' : stored ? 'READY' : failed ? 'FAILED' : 'NEVER',
         capturedAt: stored?.capturedAt.toISOString() ?? null,
         firstVisit: account.profileAskedAt === null,
         blocker: reading ? 'The profile is being read.' : blockerOf(account),
         lastRun:
            latest && !reading
               ? {
                    ok: gaveProfile,
                    message: latest.message,
                    finishedAt: latest.finishedAt?.toISOString() ?? null,
                 }
               : null,
      }
   }

   public static async get(
      userId: string,
      accountId: string
   ): Promise<{ profile: AccountProfile | null; capturedAt: string | null }> {
      const row = await PrismaService.client.linkedInAccountProfile.findFirst({
         where: {
            accountId,
            userId,
         },
         select: {
            data: true,
            capturedAt: true,
         },
      })
      const parsed = row ? accountProfileSchema.safeParse(row.data) : undefined

      return {
         profile: parsed?.success ? parsed.data : null,
         capturedAt: row?.capturedAt.toISOString() ?? null,
      }
   }

   // The first visit of the page: starts the first read once, and only when the account is signed in and has a proxy. It never
   // throws for "not now"; the answer says why. Null for an account that is not the owner's.
   public static async open(userId: string, accountId: string): Promise<{ started: boolean; reason?: string } | null> {
      const account = await ownAccount(userId, accountId)

      if (!account) {
         return null
      }

      if (account.profileAskedAt !== null) {
         return { started: false }
      }

      const blocker = blockerOf(account)

      if (blocker) {
         return {
            started: false,
            reason: blocker,
         }
      }

      try {
         await TaskService.request({
            userId,
            task: PROFILE_TASK,
            accountId,
            trigger: 'automatic',
         })

         return { started: true }
      } catch (error) {
         if (error instanceof TaskRefusedError) {
            return {
               started: false,
               reason: error.message,
            }
         }

         throw error
      }
   }
}
