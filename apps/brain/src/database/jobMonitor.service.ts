import { type Prisma } from 'generated/prisma/client'

import { type JobHealth, type MessageReadState, everyWords, jobHealth, messageReadState } from './jobHealth'
import { type JobRunOutcome } from './jobRun.service'
import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PrismaService } from './prisma.service'

// The reads behind the admin's cron monitor (.plan/cron-monitor.md). Times leave as ISO strings.

const HOUR_MS = 60 * 60 * 1000
const HOURS = 24

type Newest = {
   job: string
   startedAt: Date
   finishedAt: Date
   durationMs: number
   outcome: JobRunOutcome
   summary: string | null
   error: string | null
}

type HourRow = {
   job: string
   hour: Date
   outcome: JobRunOutcome
   n: number
}

type Hour = {
   at: string
   worked: number
   idle: number
   failed: number
}

const iso = (date: Date) => date.toISOString()

// `counts` is a small object of numbers written by the worker; anything else is dropped.
const countsOf = (value: Prisma.JsonValue | null): Record<string, number> => {
   if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {}
   }

   return Object.fromEntries(Object.entries(value).filter(([, count]) => typeof count === 'number')) as Record<
      string,
      number
   >
}

const emptyHours = (now: Date): Hour[] => {
   const start = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - (HOURS - 1) * HOUR_MS

   return Array.from({ length: HOURS }, (_, index) => ({
      at: iso(new Date(start + index * HOUR_MS)),
      worked: 0,
      idle: 0,
      failed: 0,
   }))
}

export class JobMonitorService {
   public static async overview(now = new Date()) {
      const db = PrismaService.client
      const since = new Date(now.getTime() - HOURS * HOUR_MS)
      const [definitions, newest, streaks, buckets] = await Promise.all([
         db.jobDefinition.findMany({ orderBy: { name: 'asc' } }),
         db.$queryRaw<Newest[]>`
            SELECT DISTINCT ON ("job") "job", "startedAt", "finishedAt", "durationMs", "outcome", "summary", "error"
            FROM "JobRun" ORDER BY "job", "startedAt" DESC`,
         // Failed runs in a row: the failures since the last run that went well.
         db.$queryRaw<{ job: string; n: number }[]>`
            SELECT r."job", count(*)::int AS n FROM "JobRun" r
            WHERE r."outcome" IN ('FAILED', 'TIMED_OUT')
            AND r."startedAt" > COALESCE(
               (SELECT max(g."startedAt") FROM "JobRun" g WHERE g."job" = r."job" AND g."outcome" IN ('WORKED', 'IDLE')),
               '-infinity'::timestamp)
            GROUP BY r."job"`,
         db.$queryRaw<HourRow[]>`
            SELECT "job", date_trunc('hour', "startedAt") AS "hour", "outcome", count(*)::int AS n
            FROM "JobRun" WHERE "startedAt" >= ${since} GROUP BY 1, 2, 3`,
      ])

      const jobs = definitions.map(definition => {
         const latest = newest.find(({ job }) => job === definition.name) ?? null
         const hours = emptyHours(now)

         for (const row of buckets.filter(({ job }) => job === definition.name)) {
            const cell = hours.find(({ at }) => at === iso(row.hour))

            if (cell) {
               if (row.outcome === 'WORKED') cell.worked += row.n
               else if (row.outcome === 'IDLE') cell.idle += row.n
               else cell.failed += row.n
            }
         }

         return {
            name: definition.name,
            title: definition.title,
            purpose: definition.purpose,
            schedule: everyWords(definition.everyMs),
            health: jobHealth(definition.everyMs, latest, now),
            nextExpectedAt: latest ? iso(new Date(latest.startedAt.getTime() + definition.everyMs)) : null,
            failureStreak: streaks.find(({ job }) => job === definition.name)?.n ?? 0,
            latest: latest && {
               startedAt: iso(latest.startedAt),
               durationMs: latest.durationMs,
               outcome: latest.outcome,
               summary: latest.summary,
               error: latest.error,
            },
            last24h: {
               runs: hours.reduce((sum, hour) => sum + hour.worked + hour.idle + hour.failed, 0),
               worked: hours.reduce((sum, hour) => sum + hour.worked, 0),
               failed: hours.reduce((sum, hour) => sum + hour.failed, 0),
            },
            hours,
         }
      })

      return {
         worker: JobMonitorService.workerState(jobs.map(({ health }) => health)),
         lastRunAt:
            newest.length > 0 ? iso(new Date(Math.max(...newest.map(({ finishedAt }) => finishedAt.getTime())))) : null,
         jobs,
      }
   }

   // The worker is running when any job is on time; when every job is late nothing is running the jobs.
   private static workerState(healths: JobHealth[]) {
      if (healths.every(health => health === 'UNKNOWN')) {
         return 'UNKNOWN' as const
      }

      return healths.some(health => health === 'HEALTHY' || health === 'FAILING')
         ? ('RUNNING' as const)
         : ('NOT_RUNNING' as const)
   }

   public static async runs({
      job,
      includeIdle,
      before,
      limit,
   }: {
      job: string
      includeIdle: boolean
      before?: Date
      limit: number
   }) {
      const rows = await PrismaService.client.jobRun.findMany({
         where: {
            job,
            outcome: includeIdle ? undefined : { not: 'IDLE' },
            startedAt: before ? { lt: before } : undefined,
         },
         orderBy: { startedAt: 'desc' },
         take: limit + 1,
         select: {
            id: true,
            startedAt: true,
            durationMs: true,
            outcome: true,
            summary: true,
            error: true,
            _count: { select: { items: true } },
         },
      })
      const page = rows.slice(0, limit)

      return {
         runs: page.map(({ _count, startedAt, ...run }) => ({
            ...run,
            startedAt: iso(startedAt),
            items: _count.items,
         })),
         next: rows.length > limit ? iso(page[page.length - 1].startedAt) : null,
      }
   }

   public static async run(id: string) {
      const db = PrismaService.client
      const run = await db.jobRun.findUnique({
         where: { id },
         include: { items: { orderBy: { id: 'asc' } } },
      })

      if (!run) {
         return null
      }

      const { items } = run
      const ids = (pick: (item: (typeof items)[number]) => string | null) => [
         ...new Set(items.map(pick).filter((value): value is string => value !== null)),
      ]
      const [users, accounts, sessions] = await Promise.all([
         db.user.findMany({
            where: { id: { in: ids(item => item.userId) } },
            select: {
               id: true,
               email: true,
            },
         }),
         db.linkedInAccount.findMany({
            where: { id: { in: ids(item => item.accountId) } },
            select: {
               id: true,
               email: true,
            },
         }),
         db.spiderSession.findMany({
            where: { id: { in: ids(item => item.sessionId) } },
            select: {
               id: true,
               status: true,
               verdict: true,
               durationMs: true,
               messageImport: { select: { status: true } },
            },
         }),
      ])

      return {
         id: run.id,
         job: run.job,
         startedAt: iso(run.startedAt),
         finishedAt: iso(run.finishedAt),
         durationMs: run.durationMs,
         outcome: run.outcome,
         summary: run.summary,
         counts: countsOf(run.counts),
         error: run.error,
         instance: run.instance,
         build: run.build,
         items: run.items.map(item => {
            const session = sessions.find(({ id: sessionId }) => sessionId === item.sessionId)

            return {
               id: item.id,
               action: item.action,
               result: item.result,
               reason: item.reason,
               user: users.find(({ id: userId }) => userId === item.userId)?.email ?? null,
               account: accounts.find(({ id: accountId }) => accountId === item.accountId)?.email ?? null,
               session: session
                  ? {
                       id: session.id,
                       status: session.status,
                       verdict: session.verdict,
                       durationMs: session.durationMs,
                       stored: session.messageImport?.status ?? null,
                    }
                  : null,
            }
         }),
      }
   }

   // One row per active account: is its 2-hourly read of the messages on time, and how long between its last two.
   public static async messageReads(now = new Date()) {
      const db = PrismaService.client
      const accounts = await db.linkedInAccount.findMany({
         where: { status: 'ACTIVE' },
         orderBy: { email: 'asc' },
         select: {
            id: true,
            email: true,
            status: true,
            nextMessagesAt: true,
            user: { select: { email: true } },
         },
      })
      const sessions = await db.spiderSession.findMany({
         where: {
            task: MESSAGES_TASK,
            linkedInAccountId: { in: accounts.map(({ id }) => id) },
            startedAt: { gte: new Date(now.getTime() - 12 * HOUR_MS) },
         },
         orderBy: { startedAt: 'desc' },
         take: 5000,
         select: {
            linkedInAccountId: true,
            startedAt: true,
            status: true,
            verdict: true,
            trigger: true,
         },
      })

      return accounts.map(account => {
         const [last, before] = sessions.filter(({ linkedInAccountId }) => linkedInAccountId === account.id)
         const state: MessageReadState = messageReadState(account, now)

         return {
            accountId: account.id,
            account: account.email,
            user: account.user.email,
            state,
            nextDueAt: account.nextMessagesAt ? iso(account.nextMessagesAt) : null,
            lastReadAt: last ? iso(last.startedAt) : null,
            lastStatus: last?.status ?? null,
            lastVerdict: last?.verdict ?? null,
            lastTrigger: last?.trigger ?? null,
            gapMinutes:
               last && before ? Math.round((last.startedAt.getTime() - before.startedAt.getTime()) / 60_000) : null,
         }
      })
   }
}
