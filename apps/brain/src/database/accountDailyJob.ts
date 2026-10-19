import { dailyTime, timezoneOfCountry } from 'core'

import { VISIT_TASK } from './linkedInAccount.service'
import { LinkedInAccountValidationService } from './linkedInAccountValidation.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// One run never takes more accounts than this; the rest wait for the next pass.
const MAX_PER_RUN = 100
const DAY_MS = 24 * 60 * 60 * 1000
// A good sign-in this recent (the owner's own check, say) counts as the day's check.
const RECENT_SIGN_IN_MS = 12 * 60 * 60 * 1000

type Due = Awaited<ReturnType<typeof findDue>>[number]
type Field = 'nextCheckAt' | 'nextBrowseAt'

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
         ],
      },
      select: {
         id: true,
         userId: true,
         status: true,
         nextCheckAt: true,
         nextBrowseAt: true,
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

const requestVisit = async ({ id, userId }: Due) => {
   try {
      await TaskService.request({
         userId,
         task: VISIT_TASK,
         accountId: id,
         trigger: 'automatic',
      })

      return true
   } catch (error) {
      if (!(error instanceof TaskRefusedError)) {
         console.error(`Could not request the daily visit of account ${id}: ${(error as Error).message}`)
      }

      return false
   }
}

// Once a day per account, each at its own random time (.plan/account-daily-check.md): the sign-in check, and a visit when
// the account signed in fine within the last day. The brain worker calls `runDue` every few minutes; a check or visit that
// cannot be queued now keeps its time and is tried on the next pass.
export class AccountDailyJob {
   private static running = false

   public static async runDue(now: Date = new Date(), random: () => number = Math.random) {
      const result = {
         checks: 0,
         visits: 0,
      }

      if (AccountDailyJob.running) {
         return result
      }

      AccountDailyJob.running = true

      try {
         for (const account of await findDue(now)) {
            const timezone = timezoneOf(account)
            const next = (today: boolean) => dailyTime(now, timezone, { today }, random)
            // Sends one daily run when due; a first time is only drawn, for later today.
            const daily = async (field: Field, send: () => Promise<boolean>) => {
               const at = account[field]

               if (!at) {
                  await move(account, field, next(true))

                  return false
               }

               if (at > now || !(await send())) {
                  return false
               }

               await move(account, field, next(false))

               return true
            }

            const signedInWithin = (ms: number) =>
               account.lastVerifiedAt !== null && now.getTime() - account.lastVerifiedAt.getTime() <= ms
            const recent = signedInWithin(RECENT_SIGN_IN_MS)
            const checked = await daily(
               'nextCheckAt',
               async () => recent || LinkedInAccountValidationService.request(account.id)
            )

            if (checked && !recent) {
               result.checks += 1
            }

            if (account.status !== 'ACTIVE') {
               continue
            }

            const signedInToday = signedInWithin(DAY_MS)

            // Without a good sign-in in the last day the visit of the day is let go; the sign-in check decides first.
            const visited = await daily('nextBrowseAt', async () => !signedInToday || requestVisit(account))

            if (visited && signedInToday) {
               result.visits += 1
            }
         }
      } finally {
         AccountDailyJob.running = false
      }

      return result
   }
}
