export type ScoreLabel = 'GOOD' | 'FAIR' | 'POOR' | 'NOT_SCORED'
export type ReputationState = 'BLACKLISTED' | 'SUSPICIOUS' | 'CLEAN' | 'UNKNOWN'

// Brain's BLACKLIST_SCORE: AbuseIPDB advises blocking an address from this abuse score on.
const BLACKLIST_SCORE = 75

export const reputationBadge: Record<ReputationState, { label: string; className: string }> = {
   BLACKLISTED: {
      label: 'Blacklisted',
      className: 'bg-destructive/10 text-destructive',
   },
   SUSPICIOUS: {
      label: 'Suspicious',
      className: 'bg-warning/10 text-warning',
   },
   CLEAN: {
      label: 'Not blacklisted',
      className: 'bg-success/10 text-success',
   },
   UNKNOWN: {
      label: 'Not checked',
      className: 'border-border text-muted-foreground',
   },
}

// One sentence on what the state means for this address.
export const explainReputation = (state: ReputationState, abuseScore: number | null) => {
   switch (state) {
      case 'BLACKLISTED':
         return `AbuseIPDB rates this address ${abuseScore} of 100 for abuse. From ${BLACKLIST_SCORE} it advises blocking the address, so it counts as blacklisted.`
      case 'SUSPICIOUS':
         return `AbuseIPDB rates this address ${abuseScore} of 100 for abuse. It has reports, but is below ${BLACKLIST_SCORE}, where blocking is advised, so it is not blacklisted.`
      case 'CLEAN':
         return `AbuseIPDB rates this address ${abuseScore} of 100 for abuse: little or no sign of abuse, not blacklisted.`
      default:
         return 'The reputation was not checked (no AbuseIPDB key, or it did not answer), so the score is the speed alone.'
   }
}

type Parts = {
   reputation: number | null
   speed: number | null
   reputationWeight: number
   speedWeight: number
}

// How the number was put together, one line per part.
export const breakdownLines = (entry: {
   score: number
   abuseScore: number | null
   latencyMs: number | null
   parts: Parts
}) => {
   const { parts } = entry
   const lines: string[] = []

   if (parts.reputation !== null) {
      lines.push(
         `Reputation: 100 - abuse score ${entry.abuseScore} = ${parts.reputation}, worth ${parts.reputationWeight}% of the score`
      )
   } else {
      lines.push('Reputation: not checked')
   }

   if (parts.speed !== null) {
      lines.push(
         `Speed: ${entry.latencyMs} ms = ${parts.speed}${parts.reputation === null ? '' : `, worth ${parts.speedWeight}%`}`
      )
   }

   lines.push(
      parts.reputation === null
         ? `Score: ${entry.score} (speed alone, never above 89 without a reputation)`
         : `Score: ${entry.score}`
   )

   return lines
}

type Detail = {
   maxAgeInDays: number
   numDistinctUsers: number | null
   isWhitelisted: boolean | null
   domain: string | null
   countryCode: string | null
   hostnames: string[]
   categories: { id: number; name: string; reports: number }[]
   recent: { reportedAt: string; categories: string[]; reporterCountryCode: string | null }[]
}

// The reasons, one line each: what it was reported for and how many times.
export const reasonLines = (detail: Detail) =>
   detail.categories.length === 0
      ? [`No reports in the last ${detail.maxAgeInDays} days.`]
      : detail.categories.map(
           category => `${category.name}: ${category.reports} ${category.reports === 1 ? 'report' : 'reports'}`
        )

// The newest reports: date, what for, and the country of whoever reported it.
export const recentLines = (detail: Detail) =>
   detail.recent.map(report => {
      const day = new Date(report.reportedAt).toLocaleDateString()
      const from = report.reporterCountryCode ? ` · reported from ${report.reporterCountryCode}` : ''

      return `${day} · ${report.categories.join(', ') || 'no category'}${from}`
   })

// What else is known about the address.
export const addressLines = (detail: Detail) =>
   [
      detail.numDistinctUsers === null ? null : `Reported by ${detail.numDistinctUsers} different people`,
      detail.countryCode ? `Country: ${detail.countryCode}` : null,
      detail.domain ? `Domain: ${detail.domain}` : null,
      detail.hostnames.length > 0 ? `Host names: ${detail.hostnames.join(', ')}` : null,
      detail.isWhitelisted ? 'On an AbuseIPDB whitelist' : null,
   ].filter((line): line is string => line !== null)

export const SCORE_POLL_MS = 3000

type Tested = {
   status: string
   lastTestedAt: string | Date | null
   scoredAt: string | Date | null
}

// A usable proxy whose latest test has no score after it yet: the score follows the test by a moment.
export const awaitingScore = (proxies: Tested[] | undefined) =>
   Boolean(
      proxies?.some(
         proxy =>
            (proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH') &&
            proxy.lastTestedAt &&
            (!proxy.scoredAt || new Date(proxy.scoredAt) < new Date(proxy.lastTestedAt))
      )
   )

export const scoreClass: Record<ScoreLabel, string> = {
   GOOD: 'text-success',
   FAIR: 'text-warning',
   POOR: 'text-destructive',
   NOT_SCORED: 'text-muted-foreground',
}

// Same limits as brain's scoreLabel, for entries that come without a label (the score history).
export const labelFor = (score: number | null): ScoreLabel => {
   if (score === null) return 'NOT_SCORED'
   if (score >= 90) return 'GOOD'
   if (score >= 70) return 'FAIR'

   return 'POOR'
}

type Scored = {
   score: number | null
   scoreLabel: ScoreLabel
   reputationState: ReputationState
   isBest: boolean
   scoreHasReputation: boolean | null
   abuseScore: number | null
   abuseReports: number | null
   abuseLastReportedAt: string | Date | null
   abuseUsageType: string | null
   abuseIsp: string | null
   abuseIsTor: boolean | null
   abuseError: string | null
   latencyMs: number | null
   scoredAt: string | Date | null
}

// The lines of the score's hover text: what the number is made of, and what to do about a low one.
export const describeScore = (proxy: Scored): string[] => {
   if (proxy.score === null) {
      return ['Not scored yet. A proxy is scored after each test and once a day.']
   }

   const lines = [
      `Score ${proxy.score} of 100: ${proxy.scoreLabel === 'GOOD' ? 'good' : proxy.scoreLabel.toLowerCase()}`,
   ]

   if (proxy.scoreHasReputation) {
      lines.push(`IP abuse score ${proxy.abuseScore} of 100 (${proxy.abuseReports ?? 0} reports)`)

      if (proxy.reputationState === 'BLACKLISTED') lines.push('Blacklisted: AbuseIPDB advises blocking this address')

      if (proxy.abuseLastReportedAt) {
         lines.push(`Last reported ${new Date(proxy.abuseLastReportedAt).toLocaleDateString()}`)
      }

      if (proxy.abuseUsageType) lines.push(proxy.abuseUsageType)
      if (proxy.abuseIsp) lines.push(proxy.abuseIsp)
      if (proxy.abuseIsTor) lines.push('Tor exit node')
   } else {
      lines.push(
         proxy.abuseError ? `Reputation not checked: ${proxy.abuseError}` : 'Reputation not checked (speed only)'
      )
   }

   if (proxy.latencyMs !== null) lines.push(`Latency ${proxy.latencyMs} ms`)
   if (proxy.scoredAt) lines.push(`Scored ${new Date(proxy.scoredAt).toLocaleString()}`)
   if (proxy.isBest && proxy.scoreLabel !== 'GOOD') {
      lines.push('Used for this account, but no proxy of it scores 90 or more.')
   }

   return lines
}
