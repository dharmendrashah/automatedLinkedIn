import { describe, expect, it } from 'vitest'

import { DEFAULT_SIGNALS, MODEL_IDS, fadeFactor, modelOf, partsError, tierLinesSchema, tierOf } from './ranking'

describe('the built-in models', () => {
   it('should add up to 100 in every part set', () => {
      for (const id of MODEL_IDS) {
         expect(partsError(modelOf(id).parts), id).toBeNull()
      }
   })

   it('should refuse parts that do not add up', () => {
      expect(
         partsError({
            fit: 50,
            intent: 30,
            reach: 10,
            relationship: 9,
         })
      ).toBe('Parts must add up to 100.')
   })

   it('should not give any signal more than 30 points, so intent can be capped at its part', () => {
      for (const { points, halfLifeDays } of Object.values(DEFAULT_SIGNALS)) {
         expect(points).toBeLessThanOrEqual(30)
         expect(halfLifeDays).toBeGreaterThan(0)
      }
   })
})

describe('fadeFactor', () => {
   it('should keep all, half and a quarter of the points at 0, 1 and 2 half-lives', () => {
      expect(fadeFactor(0, 14)).toBe(1)
      expect(fadeFactor(14, 14)).toBe(0.5)
      expect(fadeFactor(28, 14)).toBe(0.25)
   })

   it('should give nothing for a date in the future or a half-life of nothing', () => {
      expect(fadeFactor(-1, 14)).toBe(0)
      expect(fadeFactor(3, 0)).toBe(0)
   })
})

describe('tiers', () => {
   const lines = tierLinesSchema.parse({})

   it('should start at 80, 60 and 40, and put a score on its line in the higher tier', () => {
      expect(lines).toEqual({
         a: 80,
         b: 60,
         c: 40,
      })
      expect([100, 80, 79, 60, 59, 40, 39, 0].map(score => tierOf(score, lines))).toEqual([
         'A',
         'A',
         'B',
         'B',
         'C',
         'C',
         'D',
         'D',
      ])
   })

   it('should refuse lines that do not go down', () => {
      expect(
         tierLinesSchema.safeParse({
            a: 60,
            b: 60,
            c: 40,
         }).success
      ).toBe(false)
      expect(
         tierLinesSchema.safeParse({
            a: 80,
            b: 60,
            c: 70,
         }).success
      ).toBe(false)
   })
})
