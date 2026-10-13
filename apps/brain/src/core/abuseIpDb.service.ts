import { z } from 'zod'

import { ABUSEIPDB_API_KEY } from 'env'

import { categoryName } from './abuseCategories'

const CHECK_URL = 'https://api.abuseipdb.com/api/v2/check'
// The verbose answer lists every report of the period (up to 10,000), so it can be large.
const TIMEOUT_MS = 20_000
// How far back AbuseIPDB looks for reports (1 to 365; its default is 30).
const MAX_AGE_IN_DAYS = 90
const RECENT_REPORTS = 10
const MAX_HOSTNAMES = 5

export type AbuseIpDbErrorKind = 'RATE_LIMITED' | 'AUTH' | 'PLAN' | 'UNAVAILABLE' | 'BAD_RESPONSE'

// The message is fixed per kind: the key and the response body never reach it.
const MESSAGES: Record<AbuseIpDbErrorKind, string> = {
   RATE_LIMITED: 'AbuseIPDB daily limit reached',
   AUTH: 'AbuseIPDB key missing or rejected',
   PLAN: 'AbuseIPDB plan does not allow this request',
   UNAVAILABLE: 'AbuseIPDB did not answer',
   BAD_RESPONSE: 'AbuseIPDB sent an answer that could not be read',
}

export class AbuseIpDbError extends Error {
   public kind: AbuseIpDbErrorKind
   public retryAfterSeconds?: number

   public constructor(kind: AbuseIpDbErrorKind, retryAfterSeconds?: number) {
      super(MESSAGES[kind])
      this.kind = kind
      this.retryAfterSeconds = retryAfterSeconds
   }
}

// What explains the score: who reported this address, for what, and how recently. Report comments are free text from
// strangers and may hold personal data, so they are never kept (.plan/proxy-reputation-details.md).
export interface AbuseDetail {
   maxAgeInDays: number
   numDistinctUsers: number | null
   isWhitelisted: boolean | null
   domain: string | null
   countryCode: string | null
   hostnames: string[]
   // The reasons, most reported first, counted over the reports of the period.
   categories: { id: number; name: string; reports: number }[]
   // The newest reports, without the comment.
   recent: { reportedAt: string; categories: string[]; reporterCountryCode: string | null }[]
}

export interface AbuseIpDbResult {
   // 0 (no sign of abuse) to 100 (certainly abusive).
   abuseScore: number
   totalReports: number
   lastReportedAt: Date | null
   usageType: string | null
   isp: string | null
   isTor: boolean | null
   detail: AbuseDetail
   // Checks left today, when AbuseIPDB said so.
   remaining: number | null
}

const answerSchema = z.object({
   data: z.object({
      abuseConfidenceScore: z.number().int().min(0).max(100),
      totalReports: z.number().int().min(0),
      numDistinctUsers: z.number().int().nullable().optional(),
      isWhitelisted: z.boolean().nullable().optional(),
      domain: z.string().nullable().optional(),
      countryCode: z.string().nullable().optional(),
      hostnames: z.array(z.string()).nullable().optional(),
      lastReportedAt: z.string().nullable().optional(),
      usageType: z.string().nullable().optional(),
      isp: z.string().nullable().optional(),
      isTor: z.boolean().nullable().optional(),
      // The comment is left out of the schema on purpose, so it is dropped when the answer is parsed.
      reports: z
         .array(
            z.object({
               reportedAt: z.string(),
               categories: z.array(z.number().int()),
               reporterCountryCode: z.string().nullable().optional(),
            })
         )
         .nullable()
         .optional(),
   }),
})

type Reports = NonNullable<z.infer<typeof answerSchema>['data']['reports']>

const summarise = (reports: Reports) => {
   const counts = new Map<number, number>()

   for (const report of reports) {
      for (const id of new Set(report.categories)) {
         counts.set(id, (counts.get(id) ?? 0) + 1)
      }
   }

   return {
      categories: [...counts]
         .map(([id, count]) => ({
            id,
            name: categoryName(id),
            reports: count,
         }))
         .sort((a, b) => b.reports - a.reports || a.id - b.id),
      recent: [...reports]
         .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt))
         .slice(0, RECENT_REPORTS)
         .map(report => ({
            reportedAt: report.reportedAt,
            categories: report.categories.map(categoryName),
            reporterCountryCode: report.reporterCountryCode ?? null,
         })),
   }
}

const toNumber = (value: string | null) => {
   const parsed = Number(value)

   return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null
}

// Asks AbuseIPDB directly from brain, never through the proxy: the only thing sent is the proxy's exit address.
export class AbuseIpDbService {
   public static isConfigured() {
      return ABUSEIPDB_API_KEY !== ''
   }

   public static async check(ip: string): Promise<AbuseIpDbResult> {
      if (!AbuseIpDbService.isConfigured()) {
         throw new AbuseIpDbError('AUTH')
      }

      const query = new URLSearchParams({
         ipAddress: ip,
         maxAgeInDays: String(MAX_AGE_IN_DAYS),
         verbose: '',
      })
      let response: Response

      try {
         response = await fetch(`${CHECK_URL}?${query}`, {
            headers: {
               Key: ABUSEIPDB_API_KEY,
               Accept: 'application/json',
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
         })
      } catch {
         throw new AbuseIpDbError('UNAVAILABLE')
      }

      if (response.status === 429) {
         throw new AbuseIpDbError('RATE_LIMITED', toNumber(response.headers.get('Retry-After')) ?? undefined)
      }

      if (response.status === 401 || response.status === 403) {
         throw new AbuseIpDbError('AUTH')
      }

      if (response.status === 402) {
         throw new AbuseIpDbError('PLAN')
      }

      if (!response.ok) {
         throw new AbuseIpDbError('UNAVAILABLE')
      }

      const parsed = answerSchema.safeParse(await response.json().catch(() => null))

      if (!parsed.success) {
         throw new AbuseIpDbError('BAD_RESPONSE')
      }

      const { data } = parsed

      return {
         abuseScore: data.data.abuseConfidenceScore,
         totalReports: data.data.totalReports,
         lastReportedAt: data.data.lastReportedAt ? new Date(data.data.lastReportedAt) : null,
         usageType: data.data.usageType ?? null,
         isp: data.data.isp ?? null,
         isTor: data.data.isTor ?? null,
         detail: {
            maxAgeInDays: MAX_AGE_IN_DAYS,
            numDistinctUsers: data.data.numDistinctUsers ?? null,
            isWhitelisted: data.data.isWhitelisted ?? null,
            domain: data.data.domain ?? null,
            countryCode: data.data.countryCode ?? null,
            hostnames: (data.data.hostnames ?? []).slice(0, MAX_HOSTNAMES),
            ...summarise(data.data.reports ?? []),
         },
         remaining: toNumber(response.headers.get('X-RateLimit-Remaining')),
      }
   }
}
