import { describe, expect, it } from 'vitest'

import { GOOD_SCORE, pickBest, reputationState, scoreLabel, scoreParts, scoreProxy } from './proxyScore'

describe('reputationState', () => {
   it.each([
      [null, 'UNKNOWN'],
      [0, 'CLEAN'],
      [24, 'CLEAN'],
      [25, 'SUSPICIOUS'],
      [74, 'SUSPICIOUS'],
      [75, 'BLACKLISTED'],
      [100, 'BLACKLISTED'],
   ])('should call an abuse score of %s %s', (abuseScore, expected) => {
      expect(reputationState(abuseScore)).toBe(expected)
   })
})

describe('scoreParts', () => {
   it('should split the score into reputation and speed with their weights', () => {
      expect(
         scoreParts({
            abuseScore: 10,
            latencyMs: 1000,
         })
      ).toEqual({
         reputation: 90,
         speed: 80,
         reputationWeight: 70,
         speedWeight: 30,
      })
   })

   it('should have no reputation part without an abuse score, and no speed part without a latency', () => {
      expect(
         scoreParts({
            abuseScore: null,
            latencyMs: 500,
         })
      ).toMatchObject({
         reputation: null,
         speed: 100,
      })
      expect(
         scoreParts({
            abuseScore: 0,
            latencyMs: null,
         })
      ).toMatchObject({
         reputation: 100,
         speed: null,
      })
   })

   it.each([
      [0, 500],
      [10, 1000],
      [14, 500],
      [100, 3000],
   ])('should add up to the score for abuse %i at %i ms', (abuseScore, latencyMs) => {
      const parts = scoreParts({
         abuseScore,
         latencyMs,
      })

      expect(
         Math.round(
            (parts.reputationWeight * (parts.reputation ?? 0) + parts.speedWeight * (parts.speed ?? 0)) /
               (parts.reputationWeight + parts.speedWeight)
         )
      ).toBe(
         scoreProxy({
            abuseScore,
            latencyMs,
         })
      )
   })
})

describe('scoreProxy', () => {
   it.each([
      // abuse score, latency, expected
      [0, 500, 100],
      [0, 100, 100],
      [0, 1000, 94],
      [10, 500, 93],
      [14, 500, 90],
      [15, 500, 90],
      [16, 500, 89],
      [0, 1500, 88],
      [0, 3000, 70],
      [0, 9000, 70],
      [100, 500, 30],
      [100, 3000, 0],
   ])('should score abuse %i at %i ms as %i', (abuseScore, latencyMs, expected) => {
      expect(
         scoreProxy({
            abuseScore,
            latencyMs,
         })
      ).toBe(expected)
   })

   it('should have no score without a latency, because the proxy did not answer', () => {
      expect(
         scoreProxy({
            abuseScore: 0,
            latencyMs: null,
         })
      ).toBeNull()
      expect(
         scoreProxy({
            abuseScore: null,
            latencyMs: null,
         })
      ).toBeNull()
   })

   it('should use the speed alone without a reputation, and never call that good', () => {
      expect(
         scoreProxy({
            abuseScore: null,
            latencyMs: 500,
         })
      ).toBe(89)
      expect(
         scoreProxy({
            abuseScore: null,
            latencyMs: 1000,
         })
      ).toBe(80)
      expect(
         scoreProxy({
            abuseScore: null,
            latencyMs: 3000,
         })
      ).toBe(0)
      expect(
         scoreProxy({
            abuseScore: null,
            latencyMs: 500,
         })
      ).toBeLessThan(GOOD_SCORE)
   })
})

describe('scoreLabel', () => {
   it.each([
      [null, 'NOT_SCORED'],
      [100, 'GOOD'],
      [90, 'GOOD'],
      [89, 'FAIR'],
      [70, 'FAIR'],
      [69, 'POOR'],
      [0, 'POOR'],
   ])('should label %s as %s', (score, expected) => {
      expect(scoreLabel(score)).toBe(expected)
   })
})

describe('pickBest', () => {
   const row = (id: string, extra: Partial<Parameters<typeof pickBest>[0][number]> = {}) => ({
      id,
      status: 'ACTIVE' as const,
      isPrimary: false,
      score: null,
      latencyMs: null,
      lastTestedAt: null,
      ...extra,
   })

   it('should return null when there is nothing to pick', () => {
      expect(pickBest([])).toBeNull()
   })

   it('should pick the highest score', () => {
      const rows = [row('a', { score: 80 }), row('b', { score: 95 }), row('c', { score: 91 })]

      expect(pickBest(rows)?.id).toBe('b')
   })

   it('should keep the primary while it is within 5 points of the best', () => {
      const rows = [
         row('a', { score: 95 }),
         row('p', {
            score: 90,
            isPrimary: true,
         }),
      ]

      expect(pickBest(rows)?.id).toBe('p')
   })

   it('should drop the primary when it is more than 5 points behind', () => {
      const rows = [
         row('a', { score: 96 }),
         row('p', {
            score: 90,
            isPrimary: true,
         }),
      ]

      expect(pickBest(rows)?.id).toBe('a')
   })

   it('should not keep an unscored primary over a scored proxy', () => {
      const rows = [row('a', { score: 60 }), row('p', { isPrimary: true })]

      expect(pickBest(rows)?.id).toBe('a')
   })

   it('should rank an unscored proxy after a scored one', () => {
      expect(pickBest([row('x'), row('a', { score: 10 })])?.id).toBe('a')
   })

   it('should still prefer the primary, then the fastest, then the latest tested, when nothing is scored', () => {
      expect(pickBest([row('a'), row('p', { isPrimary: true })])?.id).toBe('p')
      expect(pickBest([row('a', { latencyMs: 900 }), row('b', { latencyMs: 300 })])?.id).toBe('b')
      expect(pickBest([row('a', { latencyMs: 300 }), row('b')])?.id).toBe('a')
      expect(
         pickBest([
            row('a', { lastTestedAt: new Date('2026-10-01') }),
            row('b', { lastTestedAt: new Date('2026-10-02') }),
         ])?.id
      ).toBe('b')
   })

   it('should prefer a healthy proxy over a country mismatch, whatever the scores', () => {
      const rows = [
         row('m', {
            status: 'GEO_MISMATCH',
            score: 99,
         }),
         row('a', { score: 40 }),
      ]

      expect(pickBest(rows)?.id).toBe('a')
   })

   it('should use a country mismatch when it is all there is', () => {
      expect(
         pickBest([
            row('m', {
               status: 'GEO_MISMATCH',
               score: 50,
            }),
         ])?.id
      ).toBe('m')
   })
})
