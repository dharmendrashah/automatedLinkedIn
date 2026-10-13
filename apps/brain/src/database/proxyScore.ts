// How a proxy is scored and chosen (.plan/proxy-ip-reputation.md). Tuning is a change of the constants here.

// A score at or above this is good; below it the best proxy is still used, with a warning.
export const GOOD_SCORE = 90
const FAIR_SCORE = 70

const REPUTATION_WEIGHT = 7
const SPEED_WEIGHT = 3
// Fastest answer that still earns the full speed score, and the slowest that earns any (the /proxies "fast" limit).
const FAST_MS = 500
const SLOW_MS = 3000
// A score without a reputation behind it never reaches GOOD.
const NO_REPUTATION_CAP = GOOD_SCORE - 1
// The primary proxy keeps its place while it is this close to the best, so the account does not change IP every day.
const PRIMARY_MARGIN = 5

const clamp = (value: number) => Math.min(100, Math.max(0, value))

const speed = (latencyMs: number) => clamp((100 * (SLOW_MS - latencyMs)) / (SLOW_MS - FAST_MS))

// From this abuse score on, AbuseIPDB's own advice is to block the address (it recommends 75 to 100).
export const BLACKLIST_SCORE = 75
const SUSPICIOUS_SCORE = 25

export type ReputationState = 'BLACKLISTED' | 'SUSPICIOUS' | 'CLEAN' | 'UNKNOWN'

export const reputationState = (abuseScore: number | null): ReputationState => {
   if (abuseScore === null) return 'UNKNOWN'
   if (abuseScore >= BLACKLIST_SCORE) return 'BLACKLISTED'
   if (abuseScore >= SUSPICIOUS_SCORE) return 'SUSPICIOUS'

   return 'CLEAN'
}

// The two parts a score is made of, each 0 to 100, with their weights out of 100, so a screen can show the sum.
export const scoreParts = ({ abuseScore, latencyMs }: { abuseScore: number | null; latencyMs: number | null }) => ({
   reputation: abuseScore === null ? null : clamp(100 - abuseScore),
   speed: latencyMs === null ? null : Math.round(speed(latencyMs)),
   reputationWeight: REPUTATION_WEIGHT * 10,
   speedWeight: SPEED_WEIGHT * 10,
})

// 0 to 100, higher is better. Null when the proxy did not answer (no latency).
export const scoreProxy = ({ abuseScore, latencyMs }: { abuseScore: number | null; latencyMs: number | null }) => {
   if (latencyMs === null) {
      return null
   }

   if (abuseScore === null) {
      return Math.min(NO_REPUTATION_CAP, Math.round(speed(latencyMs)))
   }

   // Whole-number weights keep the rounding exact at the boundaries.
   return Math.round(
      (REPUTATION_WEIGHT * clamp(100 - abuseScore) + SPEED_WEIGHT * speed(latencyMs)) /
         (REPUTATION_WEIGHT + SPEED_WEIGHT)
   )
}

export type ScoreLabel = 'GOOD' | 'FAIR' | 'POOR' | 'NOT_SCORED'

export const scoreLabel = (score: number | null): ScoreLabel => {
   if (score === null) return 'NOT_SCORED'
   if (score >= GOOD_SCORE) return 'GOOD'
   if (score >= FAIR_SCORE) return 'FAIR'

   return 'POOR'
}

interface Rankable {
   id: string
   status: string
   isPrimary: boolean
   score: number | null
   latencyMs: number | null
   lastTestedAt: Date | null
}

const compare = (a: Rankable, b: Rankable) =>
   (b.score ?? -1) - (a.score ?? -1) ||
   Number(b.isPrimary) - Number(a.isPrimary) ||
   (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) ||
   (b.lastTestedAt?.getTime() ?? 0) - (a.lastTestedAt?.getTime() ?? 0)

// The proxy to use among an account's usable ones: healthy before a country mismatch, then the highest score (the
// primary wins while within PRIMARY_MARGIN of it), then the fastest, then the latest tested. Unscored ones rank last.
export const pickBest = <T extends Rankable>(rows: T[]): T | null => {
   const healthy = rows.filter(row => row.status === 'ACTIVE')
   const pool = healthy.length > 0 ? healthy : rows
   const [best] = [...pool].sort(compare)

   if (!best) {
      return null
   }

   const primary = pool.find(row => row.isPrimary)

   if (primary && best.score !== null && primary.score !== null && primary.score >= best.score - PRIMARY_MARGIN) {
      return primary
   }

   return best
}
