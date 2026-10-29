import { dailyTime, timezoneOfCountry } from 'core'

import { type JobItemInput } from './jobRun.service'
import { VISIT_TASK } from './linkedInAccount.service'
import { LinkedInAccountValidationService } from './linkedInAccountValidation.service'
import { CONNECTIONS_TASK } from './linkedInConnection.hooks'
import { INVITATIONS_TASK } from './linkedInInvitation.hooks'
import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PROFILE_TASK } from './linkedInProfile.hooks'
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
// Before each first-day read the job waits a random time up to this, so new accounts do not all start at the same minute.
const FIRST_READ_SPREAD_MS = 20 * 60 * 1000

type Due = Awaited<ReturnType<typeof findDue>>[number]
type Field =
   | 'nextCheckAt'
   | 'nextBrowseAt'
   | 'nextMessagesAt'
   | 'nextInvitationsAt'
   | 'nextFirstReadAt'
   | 'nextConnectionsAt'
   | 'nextProfileAt'
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
            {
               status: 'ACTIVE',
               OR: due('nextInvitationsAt'),
            },
            // A first read still to do, or the weekly and monthly reads after it (.plan/first-day-reads.md).
            {
               status: 'ACTIVE',
               OR: [
                  { profileAskedAt: null },
                  { invitationsReadAt: null },
                  { connectionsReadAt: null },
                  ...due('nextConnectionsAt'),
                  ...due('nextProfileAt'),
               ],
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
         nextInvitationsAt: true,
         nextFirstReadAt: true,
         nextConnectionsAt: true,
         nextProfileAt: true,
         firstSignedInAt: true,
         profileAskedAt: true,
         invitationsReadAt: true,
         connectionsReadAt: true,
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

const requestVisit = (account: Due) => askFor(account, VISIT_TASK, 'the daily visit')

const requestInvitations = (account: Due, firstDay = false) =>
   askFor(account, INVITATIONS_TASK, 'the read of the connection requests', { answers: [] }, firstDay)

// Asks for one task of the account in the background. A refusal (busy, budget, working hours) keeps the time for the next pass.
const askFor = async (
   { id, userId }: Due,
   task: string,
   what: string,
   input?: Record<string, unknown>,
   firstDay = false
): Promise<Attempt> => {
   try {
      const { id: sessionId } = await TaskService.request({
         userId,
         task,
         accountId: id,
         trigger: 'automatic',
         ...(input && { input }),
         ...(firstDay && { firstDay: true }),
      })

      return {
         kind: 'asked',
         sessionId,
      }
   } catch (error) {
      if (!(error instanceof TaskRefusedError)) {
         console.error(`Could not request ${what} of account ${id}: ${(error as Error).message}`)
      }

      return {
         kind: 'retry',
         reason: error instanceof TaskRefusedError ? error.message : NOT_QUEUED,
      }
   }
}

// A new account's first reads, in this order (.plan/first-day-reads.md): its own profile, the connection requests, the connections.
// The first read of the messages follows through the usual 2-hour read. Each is done once the account has it; one tried in the last
// day that did not finish is left for tomorrow, so a failing read is not asked every pass.
const FIRST_READS = [
   {
      action: 'profile-read',
      task: PROFILE_TASK,
      what: 'the first read of the own profile',
      done: (account: Due) => account.profileAskedAt !== null,
   },
   {
      action: 'invitations-read',
      task: INVITATIONS_TASK,
      what: 'the first read of the connection requests',
      input: { answers: [] },
      done: (account: Due) => account.invitationsReadAt !== null,
   },
   {
      action: 'connections-read',
      task: CONNECTIONS_TASK,
      what: 'the first read of the connections',
      input: {},
      done: (account: Due) => account.connectionsReadAt !== null,
   },
] as const

const triedToday = async (account: Due, tasks: string[], now: Date) =>
   new Set(
      (
         await PrismaService.client.spiderSession.findMany({
            where: {
               linkedInAccountId: account.id,
               task: { in: tasks },
               startedAt: { gte: new Date(now.getTime() - DAY_MS) },
            },
            select: { task: true },
         })
      ).map(({ task }) => task)
   )

const requestMessages = async (account: Due, now: Date, firstDay = false): Promise<Attempt> => {
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
         ...(firstDay && { firstDay: true }),
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
         invitationReads: 0,
         firstReads: 0,
         repeatReads: 0,
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
            // Sends one daily run when due; a first time is only drawn, for later today. `after` sets the next time without a draw.
            // Returns whether a task was asked for. Every account that was due leaves an item, asked or why not.
            const daily = async (field: Field, action: string, send: () => Promise<Attempt>, after?: () => Date) => {
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
               await move(account, field, after ? after() : next(false))

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
            // The first day's reads may start outside working hours for 24 hours after the first good sign-in.
            const firstDay =
               account.firstSignedInAt !== null && now.getTime() - account.firstSignedInAt.getTime() <= DAY_MS
            const spread = () => new Date(now.getTime() + Math.floor(random() * FIRST_READ_SPREAD_MS))
            const toDo = FIRST_READS.filter(read => !read.done(account))

            if (toDo.length > 0 && signedInToday) {
               const tried = await triedToday(
                  account,
                  toDo.map(({ task }) => task),
                  now
               )
               const read = toDo.find(({ task }) => !tried.has(task))

               // The first reads come before anything else of the account; the others wait until each was tried once.
               if (read) {
                  if (!account.nextFirstReadAt) {
                     await move(account, 'nextFirstReadAt', spread())
                     result.drawn += 1

                     continue
                  }

                  const asked = await daily(
                     'nextFirstReadAt',
                     read.action,
                     () => askFor(account, read.task, read.what, 'input' in read ? read.input : undefined, firstDay),
                     spread
                  )

                  if (asked) {
                     result.firstReads += 1

                     // Read today: the daily read of the requests starts tomorrow.
                     if (read.task === INVITATIONS_TASK) {
                        await move(account, 'nextInvitationsAt', next(false))
                     }
                  }

                  continue
               }
            }

            // The first read of the messages, as soon as the other first reads were tried, not at a time drawn for later.
            if (signedInToday && account.nextMessagesAt === null && account.messagesBackfilledAt === null) {
               await move(account, 'nextMessagesAt', now)
               account.nextMessagesAt = now
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
               async () =>
                  signedInToday
                     ? requestMessages(account, now, firstDay && account.messagesBackfilledAt === null)
                     : notSignedIn,
               () => new Date(now.getTime() + MESSAGES_EVERY_MS)
            )

            if (read) {
               result.reads += 1
            }

            const invitations = await daily('nextInvitationsAt', 'invitations-read', async () =>
               signedInToday ? requestInvitations(account) : notSignedIn
            )

            if (invitations) {
               result.invitationReads += 1
            }

            // After the first read, the connections again once a week and the own profile once a month, each at a random time.
            const repeat = async (
               field: 'nextConnectionsAt' | 'nextProfileAt',
               days: number,
               done: boolean,
               ask: () => Promise<Attempt>,
               action: string
            ) => {
               const later = () => new Date(next(false).getTime() + (days - 1) * DAY_MS)

               if (!done) {
                  return
               }

               if (!account[field]) {
                  await move(account, field, later())
                  result.drawn += 1

                  return
               }

               if (await daily(field, action, async () => (signedInToday ? ask() : notSignedIn), later)) {
                  result.repeatReads += 1
               }
            }

            await repeat(
               'nextConnectionsAt',
               7,
               account.connectionsReadAt !== null,
               () => askFor(account, CONNECTIONS_TASK, 'the weekly read of the connections', {}),
               'connections-read'
            )
            await repeat(
               'nextProfileAt',
               30,
               account.profileAskedAt !== null,
               () => askFor(account, PROFILE_TASK, 'the monthly read of the own profile'),
               'profile-read'
            )
         }
      } finally {
         AccountDailyJob.running = false
      }

      return result
   }
}
