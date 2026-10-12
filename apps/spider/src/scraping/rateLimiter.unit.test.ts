import { describe, expect, it } from 'vitest'

import { HostRateLimiter } from './rateLimiter'

const fakeClock = () => {
   let now = 1_000_000
   const sleeps: number[] = []

   return {
      sleeps,
      clock: {
         now: () => now,
         sleep: (ms: number) => {
            sleeps.push(ms)
            now += ms

            return Promise.resolve()
         },
      },
      advance: (ms: number) => {
         now += ms
      },
   }
}

describe('HostRateLimiter', () => {
   it('should not delay the first request to a host', async () => {
      const { clock, sleeps } = fakeClock()

      await new HostRateLimiter(2000, clock).wait('example.com')

      expect(sleeps).toEqual([])
   })

   it('should keep the minimum gap between two requests to the same host', async () => {
      const { clock, sleeps } = fakeClock()
      const limiter = new HostRateLimiter(2000, clock)

      await limiter.wait('example.com')
      await limiter.wait('example.com')

      expect(sleeps).toEqual([2000])
   })

   it('should only wait for what is left of the gap', async () => {
      const { clock, sleeps, advance } = fakeClock()
      const limiter = new HostRateLimiter(2000, clock)

      await limiter.wait('example.com')
      advance(1500)
      await limiter.wait('example.com')

      expect(sleeps).toEqual([500])
   })

   it('should not wait when the gap has already passed', async () => {
      const { clock, sleeps, advance } = fakeClock()
      const limiter = new HostRateLimiter(2000, clock)

      await limiter.wait('example.com')
      advance(5000)
      await limiter.wait('example.com')

      expect(sleeps).toEqual([])
   })

   it('should track each host separately', async () => {
      const { clock, sleeps } = fakeClock()
      const limiter = new HostRateLimiter(2000, clock)

      await limiter.wait('a.example.com')
      await limiter.wait('b.example.com')

      expect(sleeps).toEqual([])
   })

   it('should use a longer delay a site asks for, but never a shorter one', async () => {
      const { clock, sleeps } = fakeClock()
      const limiter = new HostRateLimiter(2000, clock)

      limiter.requireAtLeast('slow.example.com', 5000)
      limiter.requireAtLeast('fast.example.com', 100)

      await limiter.wait('slow.example.com')
      await limiter.wait('slow.example.com')
      await limiter.wait('fast.example.com')
      await limiter.wait('fast.example.com')

      expect(sleeps).toEqual([5000, 2000])
   })

   it('should be a fixed delay: the same inputs always wait the same time', async () => {
      const first = fakeClock()
      const second = fakeClock()

      for (const { clock } of [first, second]) {
         const limiter = new HostRateLimiter(1234, clock)

         await limiter.wait('x.test')
         await limiter.wait('x.test')
      }

      expect(first.sleeps).toEqual(second.sleeps)
   })
})
