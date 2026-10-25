import { BROWSE_MINUTES, type BrowseMode } from '@automatedLinkedIn/contracts'

import {
   type Office,
   allowance,
   bitsToDays,
   dayKey,
   daysToBits,
   hoursProblem,
   isTimeZone,
   isWorkingDay,
   lastDayKeys,
   weekdayOfKey,
   whenText,
} from './browseAllowance'
import { BrowseBudgetService, STALE_AFTER_MS } from './browseBudget.service'
import { zoneOfCountry } from './browseZone'
import { VISITS_PER_DAY } from './pageVisit.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'

// What the Accounts screens show about browsing time (.plan/account-browsing-ui.md), and the owner's changes to it.

export type BrowseState = 'OPEN' | 'WAITING_FOR_SLOT' | 'DAY_FULL' | 'OUTSIDE_HOURS' | 'NOT_BROWSING'

export type AccountBrowse = {
   accountId: string
   email: string
   clientLabel: string | null
   mode: BrowseMode
   usedSeconds: number
   state: BrowseState
   nextAt: string | null
   hours: { days: number[]; startMinute: number; endMinute: number; timeZone: string }
   proxyTimeZone: string
   last30: number[]
   idleWorkingDays: number
   overLimitDays14: number
   viewsLeft: number | null
}

export type DayUsage = { day: string; seconds: number; sessions: number; limitSeconds: number }

export type BrowseChange = {
   mode?: BrowseMode
   hours?: { days: number[]; startMinute: number; endMinute: number; timeZone: string }
   clientLabel?: string | null
}

// What the owner asked for cannot be kept (hours too short for the limit, a zone that does not exist).
export class BrowseSettingsError extends Error {}

// A profile view takes about this long (a local recording read 2 minutes 32 seconds).
const VIEW_SECONDS = 150
const IDLE_LOOKBACK_DAYS = 30

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

type Usage = {
   linkedInAccountId: string
   day: string
   class: 'ACTION' | 'BACKGROUND' | 'SYSTEM'
   seconds: number
   startedAt: Date
   settledAt: Date | null
}

export class BrowseService {
   // Every account of the owner with its meter, its last 30 days and what the overview counts.
   public static async overview(userId: string, now = new Date()): Promise<AccountBrowse[]> {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            email: true,
            status: true,
            clientLabel: true,
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

      if (accounts.length === 0) {
         return []
      }

      const usage = await PrismaService.client.browseUsage.findMany({
         where: {
            linkedInAccountId: { in: accounts.map(({ id }) => id) },
            startedAt: { gte: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) },
         },
         select: {
            linkedInAccountId: true,
            day: true,
            class: true,
            seconds: true,
            startedAt: true,
            settledAt: true,
         },
      })

      return accounts.map(account => {
         const office = BrowseBudgetService.officeOf(account)
         const limitSeconds = BROWSE_MINUTES[account.browseMode] * 60
         const rows = usage.filter(row => row.linkedInAccountId === account.id)
         const today = dayKey(now, office.timeZone)
         const bySeconds = this.secondsByDay(rows, now)
         const used = bySeconds.get(today) ?? 0
         const todayRows = rows.filter(row => row.day === today && this.counts(row, now))
         const { state, nextAt } = this.stateOf(
            account.status,
            {
               now,
               office,
               limitSeconds,
               used,
            },
            todayRows
         )

         return {
            accountId: account.id,
            email: account.email,
            clientLabel: account.clientLabel,
            mode: account.browseMode,
            usedSeconds: used,
            state,
            nextAt,
            hours: {
               days: bitsToDays(office.days),
               startMinute: office.startMinute,
               endMinute: office.endMinute,
               timeZone: office.timeZone,
            },
            proxyTimeZone: zoneOfCountry(
               account.proxyServers.find(({ detectedCountryCode }) => detectedCountryCode)?.detectedCountryCode
            ),
            last30: lastDayKeys(today, 30).map(day => bySeconds.get(day) ?? 0),
            idleWorkingDays: this.idleDays(bySeconds, office, today),
            overLimitDays14: lastDayKeys(today, 14).filter(day => (bySeconds.get(day) ?? 0) > limitSeconds).length,
            viewsLeft:
               state === 'NOT_BROWSING'
                  ? null
                  : Math.min(VISITS_PER_DAY, Math.max(0, Math.floor((limitSeconds - used) / VIEW_SECONDS))),
         }
      })
   }

   // A session counts while it is booked, and while it runs it counts only until it is taken for dead.
   private static counts(row: Pick<Usage, 'settledAt' | 'startedAt'>, now: Date) {
      return row.settledAt !== null || now.getTime() - row.startedAt.getTime() < STALE_AFTER_MS
   }

   private static secondsByDay(rows: Usage[], now: Date) {
      const byDay = new Map<string, number>()

      for (const row of rows.filter(item => this.counts(item, now))) {
         byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.seconds)
      }

      return byDay
   }

   // Working days in a row, before today, with nothing browsed; today with something browsed means none.
   private static idleDays(bySeconds: Map<string, number>, office: Office, today: string) {
      if ((bySeconds.get(today) ?? 0) > 0) {
         return 0
      }

      let count = 0

      for (const day of lastDayKeys(today, IDLE_LOOKBACK_DAYS + 1)
         .slice(0, -1)
         .reverse()) {
         if (!isWorkingDay(office, weekdayOfKey(day))) {
            continue
         }

         if ((bySeconds.get(day) ?? 0) > 0) {
            break
         }

         count += 1
      }

      return count
   }

   private static stateOf(
      status: string,
      { now, office, limitSeconds, used }: { now: Date; office: Office; limitSeconds: number; used: number },
      todayRows: Usage[]
   ): { state: BrowseState; nextAt: string | null } {
      if (status !== 'ACTIVE') {
         return {
            state: 'NOT_BROWSING',
            nextAt: null,
         }
      }

      const ended = todayRows.flatMap(({ settledAt }) => (settledAt ? [settledAt] : []))
      const verdict = allowance({
         now,
         office,
         capSeconds: limitSeconds,
         usedSeconds: used,
         backgroundSeconds: sum(todayRows.filter(row => row.class === 'BACKGROUND').map(({ seconds }) => seconds)),
         klass: 'ACTION',
         estimateSeconds: 300,
         lastEndedAt: ended.length > 0 ? new Date(Math.max(...ended.map(time => time.getTime()))) : null,
         inFlight: todayRows.some(({ settledAt }) => !settledAt),
      })

      if (verdict.ok) {
         return {
            state: 'OPEN',
            nextAt: null,
         }
      }

      const nextAt = whenText(verdict.until, now, office.timeZone)

      if (verdict.reason === 'OUTSIDE_OFFICE') {
         return {
            state: 'OUTSIDE_HOURS',
            nextAt,
         }
      }

      return {
         state: verdict.reason === 'DAY_FULL' ? 'DAY_FULL' : 'WAITING_FOR_SLOT',
         nextAt,
      }
   }

   private static async owned(userId: string, accountId: string) {
      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: accountId,
            userId,
         },
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

      return account
         ? {
              account,
              office: BrowseBudgetService.officeOf(account),
           }
         : null
   }

   // The days with something browsed, for the year heatmap: the last 12 months, or one calendar year. Null for an account that is not
   // the owner's. The limit shown is the account's limit now, because the history does not keep the limit of each day.
   public static async year(userId: string, accountId: string, year: number | undefined, now = new Date()) {
      const found = await this.owned(userId, accountId)

      if (!found) {
         return null
      }

      const today = dayKey(now, found.office.timeZone)
      const from = year ? `${year}-01-01` : (lastDayKeys(today, 365)[0] ?? today)
      const to = year ? `${year}-12-31` : today
      const rows = await PrismaService.client.browseUsage.findMany({
         where: {
            linkedInAccountId: accountId,
            day: {
               gte: from,
               lte: to,
            },
         },
         select: {
            linkedInAccountId: true,
            day: true,
            class: true,
            seconds: true,
            startedAt: true,
            settledAt: true,
         },
      })
      const limitSeconds = BROWSE_MINUTES[found.account.browseMode] * 60
      const days = new Map<string, DayUsage>()

      for (const row of rows.filter(item => this.counts(item, now))) {
         const current = days.get(row.day)

         days.set(row.day, {
            day: row.day,
            seconds: (current?.seconds ?? 0) + row.seconds,
            sessions: (current?.sessions ?? 0) + 1,
            limitSeconds,
         })
      }

      return [...days.values()].filter(({ seconds }) => seconds > 0).sort((a, b) => a.day.localeCompare(b.day))
   }

   // The sessions of one day with what each one counted, newest last, and a plain label from the task catalog.
   public static async day(userId: string, accountId: string, day: string) {
      const found = await this.owned(userId, accountId)

      if (!found) {
         return null
      }

      const rows = await PrismaService.client.browseUsage.findMany({
         where: {
            linkedInAccountId: accountId,
            day,
         },
         orderBy: { startedAt: 'asc' },
         select: {
            sessionId: true,
            seconds: true,
            startedAt: true,
            settledAt: true,
         },
      })
      const [sessions, catalog] = await Promise.all([
         PrismaService.client.spiderSession.findMany({
            where: { id: { in: rows.map(({ sessionId }) => sessionId) } },
            select: {
               id: true,
               task: true,
               verdict: true,
            },
         }),
         TaskService.catalog(),
      ])
      const clock = new Intl.DateTimeFormat('en-GB', {
         timeZone: found.office.timeZone,
         hour: '2-digit',
         minute: '2-digit',
         hourCycle: 'h23',
      })

      return rows.map(row => {
         const session = sessions.find(({ id }) => id === row.sessionId)
         const entry = catalog.find(({ task }) => task === session?.task)
         const verdict = session?.verdict ? entry?.verdicts[session.verdict]?.label : undefined

         return {
            id: row.sessionId,
            at: clock.format(row.startedAt),
            action: entry?.title ?? session?.task ?? 'Browsing',
            seconds: row.seconds,
            result: row.settledAt ? (verdict ?? session?.verdict ?? 'Done') : 'Running',
         }
      })
   }

   // Where today's time went, by what each session was.
   public static async mix(userId: string, accountId: string, now = new Date()) {
      const found = await this.owned(userId, accountId)

      if (!found) {
         return null
      }

      const rows = await PrismaService.client.browseUsage.findMany({
         where: {
            linkedInAccountId: accountId,
            day: dayKey(now, found.office.timeZone),
         },
         select: {
            sessionId: true,
            seconds: true,
            startedAt: true,
            settledAt: true,
         },
      })
      const [sessions, catalog] = await Promise.all([
         PrismaService.client.spiderSession.findMany({
            where: { id: { in: rows.map(({ sessionId }) => sessionId) } },
            select: {
               id: true,
               task: true,
            },
         }),
         TaskService.catalog(),
      ])
      const parts = new Map<string, number>()

      for (const row of rows.filter(item => this.counts(item, now))) {
         const task = sessions.find(({ id }) => id === row.sessionId)?.task
         const label = catalog.find(entry => entry.task === task)?.title ?? 'Other'

         parts.set(label, (parts.get(label) ?? 0) + row.seconds)
      }

      return [...parts.entries()]
         .filter(([, seconds]) => seconds > 0)
         .map(([label, seconds]) => ({
            label,
            seconds,
         }))
         .sort((a, b) => b.seconds - a.seconds)
   }

   // Changes the mode, the working hours or the client label of the owner's accounts, each kept only if the result is valid. An
   // account that is not the owner's is left out. Resolves to the ids it changed.
   public static async change(userId: string, accountIds: string[], change: BrowseChange) {
      const { hours } = change

      if (hours && !isTimeZone(hours.timeZone)) {
         throw new BrowseSettingsError('That time zone does not exist.')
      }

      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            id: { in: accountIds },
         },
         select: {
            id: true,
            email: true,
            browseMode: true,
            officeDays: true,
            officeStartMinute: true,
            officeEndMinute: true,
         },
      })

      for (const account of accounts) {
         const problem = hoursProblem(change.mode ?? account.browseMode, {
            days: hours ? daysToBits(hours.days) : account.officeDays,
            startMinute: hours?.startMinute ?? account.officeStartMinute,
            endMinute: hours?.endMinute ?? account.officeEndMinute,
         })

         if (problem) {
            throw new BrowseSettingsError(`${account.email}: ${problem}`)
         }
      }

      await PrismaService.client.linkedInAccount.updateMany({
         where: {
            userId,
            id: { in: accounts.map(({ id }) => id) },
         },
         data: {
            ...(change.mode && { browseMode: change.mode }),
            ...(hours && {
               officeTimeZone: hours.timeZone,
               officeDays: daysToBits(hours.days),
               officeStartMinute: hours.startMinute,
               officeEndMinute: hours.endMinute,
            }),
            ...(change.clientLabel !== undefined && { clientLabel: change.clientLabel }),
         },
      })

      return accounts.map(({ id }) => id)
   }
}
