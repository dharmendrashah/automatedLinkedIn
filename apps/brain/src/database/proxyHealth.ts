import { reputationState } from './proxyScore'

import { type ProxyServerStatus } from 'generated/prisma/client'

// The overall health of one proxy and what is wrong with it (.plan/proxies-page-redesign.md). One function decides, so
// the page and anything later (an email, the automation) can never disagree. The web app turns the codes into words.
export type HealthLevel = 'HEALTHY' | 'WATCH' | 'RISK' | 'ACCEPTED' | 'CHECKING' | 'PAUSED'

export type HealthIssue =
   | 'BLACKLISTED'
   | 'NOT_RESPONDING'
   | 'BOT_DETECTED'
   | 'SUSPICIOUS'
   | 'DIFFERENT_COUNTRY'
   | 'SLOW'
   | 'STALE'
   | 'REPUTATION_UNAVAILABLE'

// The order is also how a problem is ranked: the worst first.
const ISSUES: { issue: HealthIssue; risk: boolean }[] = [
   {
      issue: 'NOT_RESPONDING',
      risk: true,
   },
   {
      issue: 'BLACKLISTED',
      risk: true,
   },
   {
      issue: 'BOT_DETECTED',
      risk: true,
   },
   {
      issue: 'DIFFERENT_COUNTRY',
      risk: false,
   },
   {
      issue: 'SUSPICIOUS',
      risk: false,
   },
   {
      issue: 'SLOW',
      risk: false,
   },
   {
      issue: 'STALE',
      risk: false,
   },
   {
      issue: 'REPUTATION_UNAVAILABLE',
      risk: false,
   },
]

export const HEALTH_ISSUES = ISSUES.map(({ issue }) => issue)

const SLOW_MS = 1500
const STALE_MS = 48 * 60 * 60 * 1000
// A test this recent has its score on the way; after that a missing score is no longer worth waiting for.
const SCORE_WAIT_MS = 10 * 60 * 1000

export type BrowserVerdict = 'NOT_DETECTED' | 'DETECTED' | 'COULD_NOT_TELL'

export interface HealthInput {
   status: ProxyServerStatus
   latencyMs: number | null
   lastTestedAt: Date | null
   scoredAt: Date | null
   abuseScore: number | null
   browserVerdict: BrowserVerdict | null
   // False when there is no AbuseIPDB key: a reputation that was never going to be checked is not a problem.
   reputationEnabled: boolean
   acceptedIssues: string[]
   now: Date
}

export interface Health {
   level: HealthLevel
   // Every current problem, worst first.
   issues: HealthIssue[]
   // The ones the owner has not accepted.
   open: HealthIssue[]
}

const none = (level: HealthLevel): Health => ({
   level,
   issues: [],
   open: [],
})

export const assessHealth = (input: HealthInput): Health => {
   const { status, latencyMs, lastTestedAt, scoredAt, abuseScore, now } = input

   if (status === 'DISABLED') return none('PAUSED')
   if (status === 'PENDING') return none('CHECKING')

   if (status === 'UNREACHABLE') {
      const issues: HealthIssue[] = ['NOT_RESPONDING']
      const open = issues.filter(issue => !input.acceptedIssues.includes(issue))

      return {
         level: open.length > 0 ? 'RISK' : 'ACCEPTED',
         issues,
         open,
      }
   }

   const justTested = lastTestedAt !== null && now.getTime() - lastTestedAt.getTime() < SCORE_WAIT_MS

   if (justTested && (scoredAt === null || scoredAt < lastTestedAt)) return none('CHECKING')

   const found = new Set<HealthIssue>()
   const reputation = reputationState(abuseScore)

   if (reputation === 'BLACKLISTED') found.add('BLACKLISTED')
   if (reputation === 'SUSPICIOUS') found.add('SUSPICIOUS')
   if (reputation === 'UNKNOWN' && input.reputationEnabled) found.add('REPUTATION_UNAVAILABLE')
   if (input.browserVerdict === 'DETECTED') found.add('BOT_DETECTED')
   if (status === 'GEO_MISMATCH') found.add('DIFFERENT_COUNTRY')
   if (latencyMs !== null && latencyMs >= SLOW_MS) found.add('SLOW')
   if (lastTestedAt === null || now.getTime() - lastTestedAt.getTime() > STALE_MS) found.add('STALE')

   const issues = ISSUES.filter(({ issue }) => found.has(issue))
   const open = issues.filter(({ issue }) => !input.acceptedIssues.includes(issue))

   return {
      level: open.some(item => item.risk)
         ? 'RISK'
         : open.length > 0
           ? 'WATCH'
           : issues.length > 0
             ? 'ACCEPTED'
             : 'HEALTHY',
      issues: issues.map(item => item.issue),
      open: open.map(item => item.issue),
   }
}
