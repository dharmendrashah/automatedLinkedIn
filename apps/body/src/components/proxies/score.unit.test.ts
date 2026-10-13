import { describe, expect, it } from 'vitest'

import {
   addressLines,
   awaitingScore,
   breakdownLines,
   describeScore,
   explainReputation,
   labelFor,
   reasonLines,
   recentLines,
} from './score'

const detail = (extra: Record<string, unknown> = {}) => ({
   maxAgeInDays: 90,
   numDistinctUsers: 4,
   isWhitelisted: false,
   domain: null,
   countryCode: 'NL',
   hostnames: [],
   categories: [
      {
         id: 18,
         name: 'Brute-Force',
         reports: 3,
      },
      {
         id: 14,
         name: 'Port Scan',
         reports: 1,
      },
   ],
   recent: [
      {
         reportedAt: '2026-10-03T10:00:00+00:00',
         categories: ['Port Scan', 'Brute-Force'],
         reporterCountryCode: 'DE',
      },
      {
         reportedAt: '2026-10-02T10:00:00+00:00',
         categories: [],
         reporterCountryCode: null,
      },
   ],
   ...extra,
})

describe('explainReputation', () => {
   it('should say why an address is blacklisted, and where it is not', () => {
      expect(explainReputation('BLACKLISTED', 90)).toContain('90 of 100')
      expect(explainReputation('BLACKLISTED', 90)).toContain('counts as blacklisted')
      expect(explainReputation('SUSPICIOUS', 40)).toContain('not blacklisted')
      expect(explainReputation('CLEAN', 0)).toContain('not blacklisted')
      expect(explainReputation('UNKNOWN', null)).toContain('not checked')
   })
})

describe('breakdownLines', () => {
   it('should show each part and the total', () => {
      expect(
         breakdownLines({
            score: 94,
            abuseScore: 0,
            latencyMs: 1000,
            parts: {
               reputation: 100,
               speed: 80,
               reputationWeight: 70,
               speedWeight: 30,
            },
         })
      ).toEqual([
         'Reputation: 100 - abuse score 0 = 100, worth 70% of the score',
         'Speed: 1000 ms = 80, worth 30%',
         'Score: 94',
      ])
   })

   it('should say that a score without a reputation is the speed alone', () => {
      const lines = breakdownLines({
         score: 89,
         abuseScore: null,
         latencyMs: 500,
         parts: {
            reputation: null,
            speed: 100,
            reputationWeight: 70,
            speedWeight: 30,
         },
      })

      expect(lines[0]).toBe('Reputation: not checked')
      expect(lines.at(-1)).toContain('speed alone')
   })
})

describe('reasonLines', () => {
   it('should list what it was reported for, most reported first', () => {
      expect(reasonLines(detail())).toEqual(['Brute-Force: 3 reports', 'Port Scan: 1 report'])
   })

   it('should say when there are no reports', () => {
      expect(reasonLines(detail({ categories: [] }))).toEqual(['No reports in the last 90 days.'])
   })
})

describe('recentLines', () => {
   it('should show the reasons and the reporter country of each recent report', () => {
      const [first, second] = recentLines(detail())

      expect(first).toContain('Port Scan, Brute-Force')
      expect(first).toContain('reported from DE')
      expect(second).toContain('no category')
      expect(second).not.toContain('reported from')
   })
})

describe('addressLines', () => {
   it('should list what is known about the address, and skip what is not', () => {
      expect(addressLines(detail())).toEqual(['Reported by 4 different people', 'Country: NL'])
      expect(addressLines(detail({ numDistinctUsers: null, countryCode: null, isWhitelisted: true }))).toEqual([
         'On an AbuseIPDB whitelist',
      ])
   })
})

describe('awaitingScore', () => {
   const tested = new Date('2026-10-14T10:00:00Z')
   const proxy = (extra: Record<string, unknown> = {}) => ({
      status: 'ACTIVE',
      lastTestedAt: tested,
      scoredAt: new Date('2026-10-14T10:00:05Z'),
      ...extra,
   })

   it('should wait for a usable proxy whose latest test has no score after it', () => {
      expect(awaitingScore([proxy({ scoredAt: null })])).toBe(true)
      expect(awaitingScore([proxy({ scoredAt: new Date('2026-10-13T10:00:00Z') })])).toBe(true)
   })

   it('should not wait when the score is newer than the test', () => {
      expect(awaitingScore([proxy()])).toBe(false)
   })

   it('should not wait for a proxy that cannot be scored or was never tested', () => {
      expect(awaitingScore([proxy({ status: 'UNREACHABLE', scoredAt: null })])).toBe(false)
      expect(awaitingScore([proxy({ lastTestedAt: null, scoredAt: null })])).toBe(false)
      expect(awaitingScore(undefined)).toBe(false)
   })
})

const scored = (extra: Partial<Parameters<typeof describeScore>[0]> = {}) => ({
   score: 93,
   scoreLabel: 'GOOD' as const,
   reputationState: 'CLEAN' as const,
   isBest: false,
   scoreHasReputation: true,
   abuseScore: 10,
   abuseReports: 3,
   abuseLastReportedAt: null,
   abuseUsageType: null,
   abuseIsp: null,
   abuseIsTor: null,
   abuseError: null,
   latencyMs: 420,
   scoredAt: null,
   ...extra,
})

describe('labelFor', () => {
   it.each([
      [null, 'NOT_SCORED'],
      [90, 'GOOD'],
      [89, 'FAIR'],
      [70, 'FAIR'],
      [69, 'POOR'],
   ])('should label %s as %s', (score, label) => {
      expect(labelFor(score)).toBe(label)
   })
})

describe('describeScore', () => {
   it('should say a proxy is not scored yet', () => {
      expect(describeScore(scored({ score: null, scoreLabel: 'NOT_SCORED' }))[0]).toContain('Not scored')
   })

   it('should show the abuse score, the reports and the latency', () => {
      const lines = describeScore(scored())

      expect(lines).toContain('IP abuse score 10 of 100 (3 reports)')
      expect(lines).toContain('Latency 420 ms')
   })

   it('should say why the reputation is missing', () => {
      expect(describeScore(scored({ scoreHasReputation: false, abuseError: 'AbuseIPDB did not answer' }))).toContain(
         'Reputation not checked: AbuseIPDB did not answer'
      )
      expect(describeScore(scored({ scoreHasReputation: false }))).toContain('Reputation not checked (speed only)')
   })

   it('should say when the address is blacklisted', () => {
      expect(describeScore(scored({ reputationState: 'BLACKLISTED', abuseScore: 90 })).join(' ')).toContain(
         'Blacklisted'
      )
      expect(describeScore(scored()).join(' ')).not.toContain('Blacklisted')
   })

   it('should warn when the proxy in use is not good', () => {
      expect(describeScore(scored({ score: 80, scoreLabel: 'FAIR', isBest: true })).join(' ')).toContain(
         'no proxy of it scores 90 or more'
      )
      expect(describeScore(scored({ isBest: true })).join(' ')).not.toContain('no proxy of it')
   })
})
