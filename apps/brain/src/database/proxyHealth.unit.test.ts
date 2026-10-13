import { describe, expect, it } from 'vitest'

import { assessHealth } from './proxyHealth'

const NOW = new Date('2026-10-14T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

const input = (extra: Partial<Parameters<typeof assessHealth>[0]> = {}) => ({
   status: 'ACTIVE' as const,
   latencyMs: 400,
   lastTestedAt: minutesAgo(120),
   scoredAt: minutesAgo(119),
   abuseScore: 0,
   browserVerdict: null,
   reputationEnabled: true,
   acceptedIssues: [] as string[],
   now: NOW,
   ...extra,
})

describe('assessHealth', () => {
   it('should call a working, quick, clean proxy healthy, with nothing to do', () => {
      expect(assessHealth(input())).toEqual({
         level: 'HEALTHY',
         issues: [],
         open: [],
      })
   })

   it('should not count a browser check that was never run, or could not tell, against a proxy', () => {
      expect(assessHealth(input({ browserVerdict: null })).level).toBe('HEALTHY')
      expect(assessHealth(input({ browserVerdict: 'COULD_NOT_TELL' })).level).toBe('HEALTHY')
      expect(assessHealth(input({ browserVerdict: 'NOT_DETECTED' })).level).toBe('HEALTHY')
   })

   describe('risk', () => {
      it.each([
         ['an address that is blacklisted', { abuseScore: 75 }, 'BLACKLISTED'],
         [
            'a proxy that does not respond',
            {
               status: 'UNREACHABLE',
               latencyMs: null,
               abuseScore: null,
            },
            'NOT_RESPONDING',
         ],
         ['a proxy detected as a bot', { browserVerdict: 'DETECTED' }, 'BOT_DETECTED'],
      ] as const)('should flag %s', (_name, extra, issue) => {
         const health = assessHealth(input(extra))

         expect(health.level).toBe('RISK')
         expect(health.issues).toContain(issue)
      })
   })

   describe('keep an eye', () => {
      it.each([
         ['some reports', { abuseScore: 25 }, 'SUSPICIOUS'],
         ['a slow answer', { latencyMs: 1500 }, 'SLOW'],
         ['a different country', { status: 'GEO_MISMATCH' }, 'DIFFERENT_COUNTRY'],
         [
            'no test for two days',
            {
               lastTestedAt: minutesAgo(49 * 60),
               scoredAt: minutesAgo(49 * 60),
            },
            'STALE',
         ],
      ] as const)('should flag %s', (_name, extra, issue) => {
         const health = assessHealth(input(extra))

         expect(health.level).toBe('WATCH')
         expect(health.issues).toEqual([issue])
      })

      it('should treat a quick answer under 1.5 seconds as fine', () => {
         expect(assessHealth(input({ latencyMs: 1499 })).level).toBe('HEALTHY')
      })

      it('should flag a reputation that could not be checked only when checking is switched on', () => {
         expect(assessHealth(input({ abuseScore: null })).issues).toEqual(['REPUTATION_UNAVAILABLE'])
         expect(
            assessHealth(
               input({
                  abuseScore: null,
                  reputationEnabled: false,
               })
            ).level
         ).toBe('HEALTHY')
      })
   })

   it('should rank the worst problem first and call the proxy at risk when any problem is a risk', () => {
      const health = assessHealth(
         input({
            abuseScore: 90,
            latencyMs: 2000,
            status: 'GEO_MISMATCH',
         })
      )

      expect(health.level).toBe('RISK')
      expect(health.issues).toEqual(['BLACKLISTED', 'DIFFERENT_COUNTRY', 'SLOW'])
   })

   describe('checking', () => {
      it('should say a proxy that was just added or is being tested is being checked', () => {
         expect(
            assessHealth(
               input({
                  status: 'PENDING',
                  latencyMs: null,
               })
            ).level
         ).toBe('CHECKING')
      })

      it('should wait for the score of a test that finished a moment ago', () => {
         expect(
            assessHealth(
               input({
                  lastTestedAt: minutesAgo(1),
                  scoredAt: minutesAgo(30),
               })
            ).level
         ).toBe('CHECKING')
         expect(
            assessHealth(
               input({
                  lastTestedAt: minutesAgo(1),
                  scoredAt: null,
               })
            ).level
         ).toBe('CHECKING')
      })

      it('should stop waiting when the score never came, and say what is known', () => {
         const health = assessHealth(
            input({
               lastTestedAt: minutesAgo(30),
               scoredAt: minutesAgo(300),
               abuseScore: null,
            })
         )

         expect(health.level).toBe('WATCH')
      })
   })

   it('should call a paused proxy paused, with no problems', () => {
      expect(assessHealth(input({ status: 'DISABLED' }))).toEqual({
         level: 'PAUSED',
         issues: [],
         open: [],
      })
   })

   describe('accepted risk', () => {
      it('should show the risk as accepted when every problem was accepted', () => {
         const health = assessHealth(
            input({
               abuseScore: 90,
               acceptedIssues: ['BLACKLISTED'],
            })
         )

         expect(health).toEqual({
            level: 'ACCEPTED',
            issues: ['BLACKLISTED'],
            open: [],
         })
      })

      it('should ask again for a problem that was not part of what was accepted', () => {
         const health = assessHealth(
            input({
               abuseScore: 90,
               latencyMs: 2000,
               acceptedIssues: ['SLOW'],
            })
         )

         expect(health.level).toBe('RISK')
         expect(health.open).toEqual(['BLACKLISTED'])
      })

      it('should ignore an accepted problem that is gone', () => {
         expect(assessHealth(input({ acceptedIssues: ['BLACKLISTED'] })).level).toBe('HEALTHY')
      })
   })
})
