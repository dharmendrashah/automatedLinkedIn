import { describe, expect, it } from 'vitest'

import { planWalk } from './walk'

// A random source that gives the same numbers every run, so the plan can be checked.
const seeded = (seed: number) => {
   let state = seed

   return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

      return state / 4_294_967_296
   }
}

describe('planWalk', () => {
   it('should plan a feed read of two to three minutes and five to eight targets, whatever the day', () => {
      for (let seed = 1; seed <= 200; seed += 1) {
         const { feedMs, targets } = planWalk(seeded(seed))

         expect(feedMs).toBeGreaterThanOrEqual(120_000)
         expect(feedMs).toBeLessThanOrEqual(180_000)
         expect(targets.length).toBeGreaterThanOrEqual(5)
         expect(targets.length).toBeLessThanOrEqual(8)
      }
   })

   it('should mix the routes about 35, 30 and 35 percent', () => {
      const count = {
         post: 0,
         profile: 0,
         'post-profile': 0,
      }
      let total = 0

      for (let seed = 1; seed <= 600; seed += 1) {
         for (const route of planWalk(seeded(seed)).targets) {
            count[route] += 1
            total += 1
         }
      }

      expect(count.post / total).toBeGreaterThan(0.3)
      expect(count.post / total).toBeLessThan(0.4)
      expect(count.profile / total).toBeGreaterThan(0.25)
      expect(count.profile / total).toBeLessThan(0.35)
      expect(count['post-profile'] / total).toBeGreaterThan(0.3)
      expect(count['post-profile'] / total).toBeLessThan(0.4)
   })

   it('should not plan the same walk twice', () => {
      const walks = new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(planWalk(seeded(seed + 1)))))

      expect(walks.size).toBeGreaterThan(20)
   })

   it('should plan the extremes for the extreme draws', () => {
      expect(planWalk(() => 0)).toEqual({
         feedMs: 120_000,
         targets: ['post', 'post', 'post', 'post', 'post'],
      })
      expect(planWalk(() => 0.999_999)).toEqual({
         feedMs: 180_000,
         targets: [
            'post-profile',
            'post-profile',
            'post-profile',
            'post-profile',
            'post-profile',
            'post-profile',
            'post-profile',
            'post-profile',
         ],
      })
   })
})
