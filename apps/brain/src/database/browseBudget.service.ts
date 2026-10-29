import { BROWSE_BUDGET } from 'env'

import { type Prisma } from 'generated/prisma/client'

import {
   BROWSE_MINUTES,
   type BrowseClass,
   type TaskBudget,
   type TaskResult,
   type TaskTrigger,
} from '@automatedLinkedIn/contracts'

import { type Office, allowance, dayKey, whenText } from './browseAllowance'
import { zoneOfCountry } from './browseZone'
import { PrismaService } from './prisma.service'
import { BrowseBudgetError } from './taskErrors'

// How a session counts against an account's browsing time (.plan/account-browsing-budget.md): it is asked for with an estimate,
// and booked at what the browser really used once it ends, whatever the result.

const MINUTE_MS = 60 * 1000

// A session that never answered is not browsing any more; after this long it counts for nothing and blocks nothing.
export const STALE_AFTER_MS = 30 * MINUTE_MS

// The most a session that is not measured can be booked for.
const MAX_BOOKED_SECONDS = 3 * 60 * 60

// Short of a long wait, so many accounts do not start in the same minute.
const JITTER_MINUTES = 10

// What a task that did not announce its budget counts as.
export const DEFAULT_BUDGET: TaskBudget = {
   estimate_s: 300,
   class: 'ACTION',
}

// A verdict that means the browser never opened, so nothing was browsed.
const NO_BROWSER = new Set([
   'UNKNOWN_TASK',
   'INVALID_INPUT',
   'NEEDS_PROXY',
   'NEEDS_ACCOUNT',
   'NOT_ALLOWED',
   'NOT_QUEUED',
   'CANCELLED',
   'PROXY_FAILED',
])

// What the owner asked for decides the class: only what the system schedules by itself is background.
export const classOf = (budget: TaskBudget, trigger: TaskTrigger): BrowseClass =>
   budget.class === 'BACKGROUND' && trigger !== 'automatic' ? 'ACTION' : budget.class

type Booking = { seconds: number; source: 'MEASURED' | 'ESTIMATED' | 'NONE' }

// What a finished session counts for: the browser's own time, else the run's time when the worker did not say, else nothing.
export const bookingOf = (
   result: Pick<TaskResult, 'verdict' | 'worker' | 'started_at' | 'finished_at' | 'browser_seconds'>
): Booking => {
   if (result.browser_seconds !== undefined) {
      return {
         seconds: result.browser_seconds,
         source: 'MEASURED',
      }
   }

   if (result.worker.build === 'brain' || NO_BROWSER.has(result.verdict)) {
      return {
         seconds: 0,
         source: 'NONE',
      }
   }

   const wall = (new Date(result.finished_at).getTime() - new Date(result.started_at).getTime()) / 1000

   return {
      seconds: Math.max(0, Math.min(MAX_BOOKED_SECONDS, Math.round(wall))),
      source: 'ESTIMATED',
   }
}

const whenOf = (reason: BrowseBudgetError['reason'], when: string) => {
   switch (reason) {
      case 'OUTSIDE_OFFICE':
         return `This account is outside its working hours. It can browse again ${when}.`
      case 'DAY_FULL':
         return `This account has used its browsing time for today. It can browse again ${when}.`
      case 'BACKGROUND_FULL':
         return `This account has used the browsing time kept for background reads today. It can read again ${when}.`
      case 'TOO_SOON':
         return `This account's browsing time is spread through the day. It can start again ${when}.`
      default:
         return `This account is resting between two sessions. It can start again ${when}.`
   }
}

export class BrowseBudgetService {
   // The office of an account: its own zone, or the zone of the country its proxy exits in.
   public static officeOf(account: {
      officeTimeZone: string | null
      officeDays: number
      officeStartMinute: number
      officeEndMinute: number
      proxyServers: Array<{ detectedCountryCode: string | null }>
   }): Office {
      return {
         timeZone:
            account.officeTimeZone ??
            zoneOfCountry(
               account.proxyServers.find(({ detectedCountryCode }) => detectedCountryCode)?.detectedCountryCode
            ),
         days: account.officeDays,
         startMinute: account.officeStartMinute,
         endMinute: account.officeEndMinute,
      }
   }

   // Asked inside the transaction that saves a task, so what it reads is what the next request will see: the account's row is
   // locked, and a second request for the account waits for this one. Throws BrowseBudgetError when the account may not browse
   // now; otherwise books the estimate under the session.
   public static async reserve(
      tx: Prisma.TransactionClient,
      input: {
         accountId: string
         sessionId: string
         budget: TaskBudget
         trigger: TaskTrigger
         now?: Date
         // The owner starts it despite the refusal (a manual request only): the time is booked all the same.
         override?: boolean
         // A first-day read the account job asks for: it may start outside working hours (automatic requests only).
         firstDay?: boolean
      }
   ) {
      if (!BROWSE_BUDGET) {
         return
      }

      const { accountId, sessionId, budget, trigger, now = new Date(), override = false, firstDay = false } = input
      const klass = classOf(budget, trigger)

      await tx.$queryRaw`SELECT "id" FROM "LinkedInAccount" WHERE "id" = ${accountId} FOR UPDATE`

      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            browseMode: true,
            officeTimeZone: true,
            officeDays: true,
            officeStartMinute: true,
            officeEndMinute: true,
            proxyServers: {
               select: { detectedCountryCode: true },
               orderBy: { createdAt: 'asc' },
            },
         },
      })

      if (!account) {
         return
      }

      const office = this.officeOf(account)
      const day = dayKey(now, office.timeZone)
      const rows = await tx.browseUsage.findMany({
         where: {
            linkedInAccountId: accountId,
            day,
         },
         select: {
            class: true,
            seconds: true,
            startedAt: true,
            settledAt: true,
         },
      })
      const fresh = rows.filter(
         ({ settledAt, startedAt }) => settledAt || now.getTime() - startedAt.getTime() < STALE_AFTER_MS
      )
      const ended = rows.flatMap(({ settledAt }) => (settledAt ? [settledAt] : []))
      const verdict = allowance({
         now,
         office,
         capSeconds: BROWSE_MINUTES[account.browseMode] * 60,
         usedSeconds: fresh.reduce((sum, { seconds }) => sum + seconds, 0),
         backgroundSeconds: fresh
            .filter(row => row.class === 'BACKGROUND')
            .reduce((sum, { seconds }) => sum + seconds, 0),
         klass,
         estimateSeconds: budget.estimate_s,
         lastEndedAt: ended.length > 0 ? new Date(Math.max(...ended.map(time => time.getTime()))) : null,
         inFlight: fresh.some(({ settledAt }) => !settledAt),
         anyHour: firstDay && trigger === 'automatic',
      })

      if (!verdict.ok && !(override && trigger === 'manual')) {
         const long =
            verdict.reason === 'OUTSIDE_OFFICE' || verdict.reason === 'DAY_FULL' || verdict.reason === 'BACKGROUND_FULL'
         const until = long
            ? new Date(verdict.until.getTime() + Math.floor(Math.random() * JITTER_MINUTES) * MINUTE_MS)
            : verdict.until

         const when = whenText(until, now, office.timeZone)

         throw new BrowseBudgetError(whenOf(verdict.reason, when), verdict.reason, until, when, office.timeZone)
      }

      await tx.browseUsage.create({
         data: {
            sessionId,
            linkedInAccountId: accountId,
            day,
            class: klass,
            seconds: budget.estimate_s,
            source: 'ESTIMATED',
            startedAt: now,
         },
      })
   }

   // Replaces the estimate with what the session used, once, when its answer is applied. A session that was not booked (it
   // started before this existed, or the check is off) is left alone.
   public static async settle(
      tx: Prisma.TransactionClient,
      sessionId: string,
      result: Pick<TaskResult, 'verdict' | 'worker' | 'started_at' | 'finished_at' | 'browser_seconds'>,
      now = new Date()
   ) {
      const { seconds, source } = bookingOf(result)

      await tx.browseUsage.updateMany({
         where: {
            sessionId,
            settledAt: null,
         },
         data: {
            seconds,
            source,
            settledAt: now,
         },
      })
   }

   // The session ended without an answer from the worker (it could not even be queued): nothing was browsed.
   public static async release(sessionId: string) {
      await PrismaService.client.browseUsage.updateMany({
         where: {
            sessionId,
            settledAt: null,
         },
         data: {
            seconds: 0,
            source: 'NONE',
            settledAt: new Date(),
         },
      })
   }
}
