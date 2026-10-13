import { describe, expect, it } from 'vitest'

import { checksOf } from './checks'
import { issueInfo, levelInfo } from './health'
import { makeProxy } from './testing'

const byKey = (proxy: ReturnType<typeof makeProxy>, others = 1) =>
   Object.fromEntries(checksOf(proxy, others).map(check => [check.key, check]))

describe('checksOf', () => {
   it('should give the four checks in reading order', () => {
      expect(checksOf(makeProxy(), 1).map(check => check.key)).toEqual([
         'connection',
         'reputation',
         'location',
         'browser',
      ])
   })

   it('should say a healthy proxy works, is clean, matches and has not been browser tested', () => {
      const checks = byKey(makeProxy())

      expect(checks.connection).toMatchObject({
         tone: 'success',
         result: 'Works',
         reason: 'It answered in 0.4 s.',
      })
      expect(checks.reputation).toMatchObject({
         tone: 'success',
         result: 'Clean',
         reason: 'No reports in the last 90 days.',
      })
      expect(checks.location).toMatchObject({
         tone: 'success',
         result: 'India',
         reason: "It matches this account's other proxies.",
      })
      expect(checks.browser).toMatchObject({
         tone: 'neutral',
         result: 'Not tested yet',
      })
   })

   describe('connection', () => {
      it.each([
         ['not responding', { status: 'UNREACHABLE', latencyMs: null }, 'danger', 'Not responding'],
         ['testing', { status: 'PENDING', latencyMs: null }, 'info', 'Testing'],
         ['paused', { status: 'DISABLED' }, 'neutral', 'Paused'],
      ] as const)('should say %s', (_name, extra, tone, result) => {
         expect(byKey(makeProxy(extra)).connection).toMatchObject({
            tone,
            result,
         })
      })

      it('should say a slow proxy works, but slowly, with how long it took', () => {
         const proxy = makeProxy({
            latencyMs: 2100,
            health: {
               level: 'WATCH',
               issues: ['SLOW'],
               open: ['SLOW'],
            },
         })

         expect(byKey(proxy).connection).toMatchObject({
            tone: 'warning',
            result: 'Works, but slow',
            reason: 'It answered in 2.1 s.',
         })
      })
   })

   describe('reputation', () => {
      it('should name what a blacklisted address was reported for', () => {
         const proxy = makeProxy({
            reputationState: 'BLACKLISTED',
            abuseReports: 120,
            abuseReasons: ['Brute-Force', 'Port Scan'],
         })

         expect(byKey(proxy).reputation).toMatchObject({
            tone: 'danger',
            result: 'Blacklisted',
            reason: 'Reported 120 times for Brute-Force, Port Scan.',
         })
      })

      it('should say some reports for a suspicious address', () => {
         expect(byKey(makeProxy({ reputationState: 'SUSPICIOUS', abuseReports: 3 })).reputation).toMatchObject({
            tone: 'warning',
            result: 'Some reports',
            reason: 'Reported 3 times.',
         })
      })

      it('should say it could not check when checking is on but failed, and not checked when it never ran', () => {
         const failed = makeProxy({
            reputationState: 'UNKNOWN',
            health: {
               level: 'WATCH',
               issues: ['REPUTATION_UNAVAILABLE'],
               open: ['REPUTATION_UNAVAILABLE'],
            },
         })

         expect(byKey(failed).reputation).toMatchObject({
            tone: 'warning',
            result: 'Could not check',
         })
         expect(byKey(makeProxy({ reputationState: 'UNKNOWN' })).reputation).toMatchObject({
            tone: 'neutral',
            result: 'Not checked',
         })
      })
   })

   describe('location', () => {
      it('should warn about a different country', () => {
         const proxy = makeProxy({
            status: 'GEO_MISMATCH',
            detectedCountry: 'Germany',
            health: {
               level: 'WATCH',
               issues: ['DIFFERENT_COUNTRY'],
               open: ['DIFFERENT_COUNTRY'],
            },
         })

         expect(byKey(proxy).location).toMatchObject({
            tone: 'warning',
            result: 'Different country',
            reason: "It appears in Germany, unlike this account's other proxies.",
         })
      })

      it('should not claim a match when it is the account only proxy', () => {
         expect(byKey(makeProxy(), 0).location.reason).toBe('The country this account will appear from.')
      })

      it('should say unknown when we have not seen where it is', () => {
         expect(byKey(makeProxy({ detectedCountry: null })).location).toMatchObject({
            tone: 'neutral',
            result: 'Unknown',
         })
      })
   })

   describe('browser check', () => {
      const checked = (verdict: string) =>
         makeProxy({
            browserCheck: {
               verdict,
               checkedAt: new Date(),
               sessionId: 's1',
            },
         })

      it.each([
         ['NOT_DETECTED', 'success', 'Looks human'],
         ['DETECTED', 'danger', 'Detected as a bot'],
         ['COULD_NOT_TELL', 'neutral', 'Could not tell'],
      ])('should show %s', (verdict, tone, result) => {
         expect(byKey(checked(verdict)).browser).toMatchObject({
            tone,
            result,
         })
      })
   })

   it('should give every check a plain explanation of what it is for', () => {
      for (const check of checksOf(makeProxy(), 1)) {
         expect(check.about.length).toBeGreaterThan(20)
      }
   })
})

describe('words', () => {
   it('should have a label, tone and explanation for every health level', () => {
      for (const level of ['HEALTHY', 'WATCH', 'RISK', 'ACCEPTED', 'CHECKING', 'PAUSED'] as const) {
         expect(levelInfo[level].label).not.toBe('')
         expect(levelInfo[level].explanation).not.toBe('')
      }
   })

   it('should explain every problem the brain can report, without jargon', () => {
      const proxy = makeProxy({
         abuseReasons: ['Port Scan'],
         latencyMs: 2000,
         detectedCountry: 'Germany',
      })

      for (const issue of [
         'NOT_RESPONDING',
         'BLACKLISTED',
         'BOT_DETECTED',
         'DIFFERENT_COUNTRY',
         'SUSPICIOUS',
         'SLOW',
         'STALE',
         'REPUTATION_UNAVAILABLE',
      ] as const) {
         const { title, phrase, because } = issueInfo[issue]

         expect(title).not.toBe('')
         expect(phrase).not.toBe('')
         expect(because(proxy)).not.toMatch(/latency|GEO_MISMATCH|UNREACHABLE|abuse score|HTTP|ipinfo/i)
      }
   })

   it('should say what a blacklisted address was reported for', () => {
      expect(issueInfo.BLACKLISTED.because(makeProxy({ abuseReasons: ['Port Scan', 'Brute-Force'] }))).toContain(
         'for Port Scan, Brute-Force'
      )
   })
})
