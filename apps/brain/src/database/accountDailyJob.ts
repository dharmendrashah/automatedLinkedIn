import { dailyTime, timezoneOfCountry } from 'core'

import { type JobItemInput } from './jobRun.service'
import { VISIT_TASK } from './linkedInAccount.service'
import { LinkedInAccountValidationService } from './linkedInAccountValidation.service'
import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { messagesInput, sweepDue } from './messagesRefresh'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// One run never takes more accounts than this; the rest wait for the next pass.
const MAX_PER_RUN = 100
const DAY_MS = 24 * 60 * 60 * 1000
// The messages are read this often (12 times a day), not once a day like the check and the visit.
const MESSAGES_EVERY_MS = 2 * 60 * 60 * 1000
// The first read of an account goes through the inbox in batches, at most this many a day (.plan/messages-first-sync-and-new-only.md).
const MAX_FIRST_READS_A_DAY = 5
// A good sign-in this recent (the owner's own check, say) counts as the day's check.
const RECENT_SIGN_IN_MS = 12 * 60 * 60 * 1000

type Due = Awaited<ReturnType<typeof findDue>>[number]
type Field = 'nextCheckAt' | 'nextBrowseAt' | 'nextMessagesAt'
// Asked for: the task is queued. Let go: the time moves on without a task, for a fixed reason. Retry: it could not be queued now,
// so the time stays and the next pass tries again.
type Attempt =
   | {
        kind: 'asked'
        sessionId?: string
     }
   | {
        kind: 'letGo' | 'retry'
        reason: string
     }

const NOT_QUEUED = 'Could not be queued now, tried again on the next pass'

const findDue = (now: Date) => {
   const due = (field: Field) => [{ [field]: null }, { [field]: { lte: now } }]

   return PrismaService.client.linkedInAccount.findMany({
      where: {
         OR: [
            {
               status: { in: ['ACTIVE', 'ERROR'] },
               OR: due('nextCheckAt'),
            },
            {
               status: 'ACTIVE',
               OR: due('nextBrowseAt'),
            },
            {
               status: 'ACTIVE',
               OR: due('nextMessagesAt'),
            },
         ],
      },
      select: {
         id: true,
         userId: true,
         status: true,
         nextCheckAt: true,
         nextBrowseAt: true,
         nextMessagesAt: true,
         messagesReadAt: true,
         messagesBackfilledAt: true,
         messagesSweptAt: true,
         messagesResumeSkip: true,
         lastVerifiedAt: true,
         proxyServers: {
            where: { status: 'ACTIVE' },
            select: {
               detectedCountryCode: true,
               isPrimary: true,
            },
         },
      },
      orderBy: { id: 'asc' },
      take: MAX_PER_RUN,
   })
}

// The account's day is the day of where its proxy exits, the same place the browser says it is.
const timezoneOf = ({ proxyServers }: Due) =>
   timezoneOfCountry((proxyServers.find(({ isPrimary }) => isPrimary) ?? proxyServers[0])?.detectedCountryCode)

// Moves a time only if no other run moved it first.
const move = (account: Due, field: Field, to: Date) =>
   PrismaService.client.linkedInAccount.updateMany({
      where: {
         id: account.id,
         [field]: account[field],
      },
      data: { [field]: to },
   })

const requestVisit = async ({ id, userId }: Due): Promise<Attempt> => {
   try {
      const { id: sessionId } = await TaskService.request({
         userId,
         task: VISIT_TASK,
         accountId: id,
         trigger: 'automatic',
      })

      return {
         kind: 'asked',
         sessionId,
      }
   } catch (error) {
      if (!(error instanceof TaskRefusedError)) {
         console.error(`Could not request the daily visit of account ${id}: ${(error as Error).message}`)
      }

      return {
         kind: 'retry',
         reason: error instanceof TaskRefusedError ? error.message : NOT_QUEUED,
      }
   }
}

const requestMessages = async (account: Due, now: Date): Promise<Attempt> => {
   const { id, userId } = account

   try {
      if (account.messagesBackfilledAt === null) {
         const batches = await PrismaService.client.spiderSession.count({
            where: {
               linkedInAccountId: id,
               task: MESSAGES_TASK,
               trigger: 'automatic',
               startedAt: { gte: new Date(now.getTime() - DAY_MS) },
            },
         })

         if (batches >= MAX_FIRST_READS_A_DAY) {
            return {
               kind: 'letGo',
               reason: 'The first read of the messages has done its batches for today and goes on later',
            }
         }
      }

      const sweep = sweepDue(account, now)
      const { id: sessionId } = await TaskService.request({
         userId,
         task: MESSAGES_TASK,
         accountId: id,
         trigger: 'automatic',
         input: await messagesInput(account, { sweep }),
      })

      if (sweep) {
         await PrismaService.client.linkedInAccount.update({
            where: { id },
            data: { messagesSweptAt: now },
         })
      }

      return {
         kind: 'asked',
         sessionId,
      }
   } catch (error) {
      if (!(error instanceof TaskRefusedError)) {
         console.error(`Could not request the daily read of the messages of account ${id}: ${(error as Error).message}`)
      }

      return {
         kind: 'retry',
         reason: error instanceof TaskRefusedError ? error.message : NOT_QUEUED,
      }
   }
}

// Once a day per account, each at its own random time (.plan/account-daily-check.md): the sign-in check, and a visit when the
// account signed in fine within the last day. The messages (.plan/unibox-backend.md) are read every 2 hours on the same terms
// (.plan/unibox-read-every-2h.md). The brain worker calls `runDue` every few minutes; a check or visit that
// cannot be queued now keeps its time and is tried on the next pass.
export class AccountDailyJob {
   private static running = false

   public static async runDue(now: Date = new Date(), random: () => number = Math.random) {
      const result = {
         accounts: 0,
         checks: 0,
         visits: 0,
         reads: 0,
         drawn: 0,
         items: [] as JobItemInput[],
      }

      if (AccountDailyJob.running) {
         return result
      }

      AccountDailyJob.running = true

      try {
         const due = await findDue(now)

         result.accounts = due.length

         for (const account of due) {
            const timezone = timezoneOf(account)
            const next = (today: boolean) => dailyTime(now, timezone, { today }, random)
            // Sends one daily run when due; a first time is only drawn, for later today. `every` sets the next time without a draw.
            // Returns whether a task was asked for. Every account that was due leaves an item, asked or why not.
            const daily = async (field: Field, action: string, send: () => Promise<Attempt>, every?: number) => {
               const at = account[field]

               if (!at) {
                  await move(account, field, next(true))
                  result.drawn += 1

                  return false
               }

               if (at > now) {
                  return false
               }

               const attempt = await send()
               const item = {
                  userId: account.userId,
                  accountId: account.id,
                  action,
               }

               if (attempt.kind === 'retry') {
                  result.items.push({
                     ...item,
                     result: 'SKIPPED',
                     reason: attempt.reason,
                  })

                  return false
               }

               result.items.push(
                  attempt.kind === 'asked'
                     ? {
                          ...item,
                          result: 'ASKED',
                          sessionId: attempt.sessionId,
                       }
                     : {
                          ...item,
                          result: 'SKIPPED',
                          reason: attempt.reason,
                       }
               )
               await move(account, field, every ? new Date(now.getTime() + every) : next(false))

               return attempt.kind === 'asked'
            }

            const signedInWithin = (ms: number) =>
               account.lastVerifiedAt !== null && now.getTime() - account.lastVerifiedAt.getTime() <= ms
            const recent = signedInWithin(RECENT_SIGN_IN_MS)
            const checked = await daily('nextCheckAt', 'sign-in-check', async (): Promise<Attempt> => {
               if (recent) {
                  return {
                     kind: 'letGo',
                     reason: 'Signed in successfully in the last 12 hours, which counts as the check',
                  }
               }

               return (await LinkedInAccountValidationService.request(account.id))
                  ? { kind: 'asked' }
                  : {
                       kind: 'retry',
                       reason: NOT_QUEUED,
                    }
            })

            if (checked) {
               result.checks += 1
            }

            if (account.status !== 'ACTIVE') {
               continue
            }

            const signedInToday = signedInWithin(DAY_MS)
            // Without a good sign-in in the last day the visit and the read of the day are let go; the sign-in check decides first.
            const notSignedIn: Attempt = {
               kind: 'letGo',
               reason: 'Not signed in successfully in the last day',
            }

            const visited = await daily('nextBrowseAt', 'visit', async () =>
               signedInToday ? requestVisit(account) : notSignedIn
            )

            if (visited) {
               result.visits += 1
            }

            const read = await daily(
               'nextMessagesAt',
               'messages-read',
               async () => (signedInToday ? requestMessages(account, now) : notSignedIn),
               MESSAGES_EVERY_MS
            )

            if (read) {
               result.reads += 1
            }
         }
      } finally {
         AccountDailyJob.running = false
      }

      return result
   }
}
