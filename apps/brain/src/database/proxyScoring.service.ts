import { scoreProxy } from './proxyScore'
import { type AbuseDetail, AbuseIpDbError, AbuseIpDbService } from 'core'

import { Prisma, type ProxyServerStatus } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const HISTORY_DAYS = 30

// Prisma's Json input is a closed type; AbuseDetail is plain data, so it is passed as it is.
const toJson = (detail: AbuseDetail | Prisma.JsonValue | null | undefined) =>
   detail === null || detail === undefined ? Prisma.DbNull : (detail as Prisma.InputJsonValue)

export interface ScoreOutcome {
   // The key or the plan stopped working, or today's limit is used up: callers stop asking for today.
   stop: boolean
   retryAfterSeconds?: number
   // AbuseIPDB checks left today, when it said so.
   remaining: number | null
}

export interface DueProxy {
   id: string
   status: ProxyServerStatus
   scoredAt: Date | null
   // False for a proxy that only needs its failed AbuseIPDB lookup repeated.
   retest: boolean
}

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

const STOPS = new Set(['RATE_LIMITED', 'AUTH', 'PLAN'])

// The score of a proxy: its reputation from AbuseIPDB and its latency from the last test (.plan/proxy-ip-reputation.md).
// It is advice only: it never changes the proxy's status. Nothing but the exit IP leaves this server.
export class ProxyScoringService {
   // Scores one proxy from what is stored (its last test) and from AbuseIPDB, saves the result and a history entry.
   public static async score(proxyId: string): Promise<ScoreOutcome> {
      const now = new Date()
      const proxy = await PrismaService.client.proxyServer.findUnique({ where: { id: proxyId } })

      if (!proxy) {
         return {
            stop: false,
            remaining: null,
         }
      }

      const { detectedIp: ip, latencyMs } = proxy

      if (!['ACTIVE', 'GEO_MISMATCH'].includes(proxy.status) || !ip || latencyMs === null) {
         await PrismaService.client.proxyServer.update({
            where: { id: proxyId },
            data: {
               score: null,
               scoredAt: now,
               scoreHasReputation: null,
            },
         })

         return {
            stop: false,
            remaining: null,
         }
      }

      // The same address checked in the last day, by this proxy or another one, is not asked again.
      const known = await PrismaService.client.proxyServer.findFirst({
         where: {
            abuseIp: ip,
            abuseScore: { not: null },
            // An answer saved before details were kept is asked again, so the history can explain it.
            abuseDetail: { not: Prisma.DbNull },
            abuseError: null,
            abuseCheckedAt: { gte: new Date(now.getTime() - DAY_MS) },
         },
         orderBy: { abuseCheckedAt: 'desc' },
      })
      let abuse: Record<string, unknown> = {}
      let outcome: ScoreOutcome = {
         stop: false,
         remaining: null,
      }

      if (known) {
         abuse = {
            abuseIp: ip,
            abuseScore: known.abuseScore,
            abuseReports: known.abuseReports,
            abuseLastReportedAt: known.abuseLastReportedAt,
            abuseUsageType: known.abuseUsageType,
            abuseIsp: known.abuseIsp,
            abuseIsTor: known.abuseIsTor,
            abuseCheckedAt: known.abuseCheckedAt,
            abuseDetail: toJson(known.abuseDetail),
            abuseError: null,
         }
      } else if (AbuseIpDbService.isConfigured()) {
         try {
            const result = await AbuseIpDbService.check(ip)

            outcome = {
               stop: false,
               remaining: result.remaining,
            }
            abuse = {
               abuseIp: ip,
               abuseScore: result.abuseScore,
               abuseReports: result.totalReports,
               abuseLastReportedAt: result.lastReportedAt,
               abuseUsageType: result.usageType,
               abuseIsp: result.isp,
               abuseIsTor: result.isTor,
               abuseCheckedAt: now,
               abuseDetail: toJson(result.detail),
               abuseError: null,
            }
         } catch (error) {
            const failure = error instanceof AbuseIpDbError ? error : new AbuseIpDbError('UNAVAILABLE')

            outcome = {
               stop: STOPS.has(failure.kind),
               retryAfterSeconds: failure.retryAfterSeconds,
               remaining: null,
            }
            abuse = {
               abuseError: failure.message,
               // An answer about an older address says nothing about this one.
               ...(proxy.abuseIp !== ip && {
                  abuseIp: null,
                  abuseScore: null,
                  abuseReports: null,
                  abuseLastReportedAt: null,
                  abuseUsageType: null,
                  abuseIsp: null,
                  abuseIsTor: null,
                  abuseCheckedAt: null,
                  abuseDetail: Prisma.DbNull,
               }),
            }
         }
      }

      // A failed lookup leaves no score in `abuse`, so the proxy is scored on speed alone.
      const abuseScore = typeof abuse.abuseScore === 'number' ? abuse.abuseScore : null
      const score = scoreProxy({
         abuseScore,
         latencyMs,
      })

      await PrismaService.client.proxyServer.update({
         where: { id: proxyId },
         data: {
            score,
            scoredAt: now,
            scoreHasReputation: abuseScore !== null,
            ...abuse,
         },
      })

      if (score !== null) {
         await ProxyScoringService.saveHistory(proxyId, {
            ip,
            score,
            abuseScore,
            latencyMs,
            detail: abuseScore === null ? Prisma.DbNull : (abuse.abuseDetail as ReturnType<typeof toJson>),
            status: proxy.status,
            now,
         })
      }

      return outcome
   }

   // Scores after a save without making the save wait for a second network call. A failure is only logged.
   public static scoreSoon(proxyId: string) {
      ProxyScoringService.score(proxyId).catch((error: unknown) => {
         console.error(`Could not score proxy ${proxyId}: ${(error as Error).message}`)
      })
   }

   // The proxies to score now, oldest first: not scored since the start of today (UTC), plus the ones whose AbuseIPDB
   // lookup failed more than an hour ago. Paused proxies are left alone.
   public static async findDue(now: Date, limit: number): Promise<DueProxy[]> {
      const today = startOfUtcDay(now)
      const rows = await PrismaService.client.proxyServer.findMany({
         where: {
            status: { not: 'DISABLED' },
            OR: [
               { scoredAt: null },
               { scoredAt: { lt: today } },
               ...(AbuseIpDbService.isConfigured()
                  ? [
                       {
                          abuseError: { not: null },
                          scoredAt: { lt: new Date(now.getTime() - HOUR_MS) },
                       },
                    ]
                  : []),
            ],
         },
         orderBy: {
            scoredAt: {
               sort: 'asc',
               nulls: 'first',
            },
         },
         take: limit,
         select: {
            id: true,
            status: true,
            scoredAt: true,
         },
      })

      return rows.map(({ id, status, scoredAt }) => ({
         id,
         status,
         scoredAt,
         retest: scoredAt === null || scoredAt < today,
      }))
   }

   // True for the one caller that takes the proxy: nobody scored it since `foundScoredAt`, so two runs never both do it.
   public static async claim(proxyId: string, foundScoredAt: Date | null) {
      const { count } = await PrismaService.client.proxyServer.updateMany({
         where: {
            id: proxyId,
            scoredAt: foundScoredAt,
         },
         data: { scoredAt: new Date() },
      })

      return count === 1
   }

   private static async saveHistory(
      proxyServerId: string,
      entry: {
         ip: string
         score: number
         abuseScore: number | null
         latencyMs: number
         detail: ReturnType<typeof toJson>
         status: ProxyServerStatus
         now: Date
      }
   ) {
      try {
         await PrismaService.client.proxyScore.create({
            data: {
               proxyServerId,
               ip: entry.ip,
               score: entry.score,
               abuseScore: entry.abuseScore,
               latencyMs: entry.latencyMs,
               reputationChecked: entry.abuseScore !== null,
               detail: entry.detail,
               status: entry.status,
            },
         })
         const cutoff = new Date(entry.now.getTime() - HISTORY_DAYS * DAY_MS)

         await PrismaService.client.proxyScore.deleteMany({ where: { scoredAt: { lt: cutoff } } })
      } catch (error) {
         console.error(`Could not save the score history of proxy ${proxyServerId}: ${(error as Error).message}`)
      }
   }
}
