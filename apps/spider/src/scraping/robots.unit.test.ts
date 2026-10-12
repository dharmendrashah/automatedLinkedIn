import { describe, expect, it, vi } from 'vitest'

import { RobotsGuard } from './robots'

const robots = (body: string, status = 200) => new Response(body, { status })

const guardWith = (respond: () => Response | Promise<Response>, now = () => 0) => {
   const fetcher = vi.fn(async () => respond()) as unknown as typeof fetch

   return {
      fetcher,
      guard: new RobotsGuard('automatedlinkedin-spider', fetcher, 60_000, now),
   }
}

describe('RobotsGuard', () => {
   it('should allow everything when the site has no robots.txt (4xx)', async () => {
      const { guard } = guardWith(() => robots('not found', 404))

      await expect(guard.check(new URL('https://example.com/any'))).resolves.toMatchObject({ allowed: true })
   })

   it('should obey a disallow rule for our agent', async () => {
      const { guard } = guardWith(() => robots('User-agent: *\nDisallow: /private\n'))

      await expect(guard.check(new URL('https://example.com/private/x'))).resolves.toMatchObject({ allowed: false })
      await expect(guard.check(new URL('https://example.com/public'))).resolves.toMatchObject({ allowed: true })
   })

   it('should obey a rule written for our own agent token over the wildcard', async () => {
      const { guard } = guardWith(() =>
         robots('User-agent: *\nAllow: /\n\nUser-agent: automatedlinkedin-spider\nDisallow: /\n')
      )

      await expect(guard.check(new URL('https://example.com/'))).resolves.toMatchObject({ allowed: false })
   })

   it('should report the crawl delay in milliseconds', async () => {
      const { guard } = guardWith(() => robots('User-agent: *\nCrawl-delay: 7\n'))

      await expect(guard.check(new URL('https://example.com/'))).resolves.toEqual({
         allowed: true,
         crawlDelayMs: 7000,
      })
   })

   it('should treat an unavailable robots.txt (5xx) as disallow all, as RFC 9309 says', async () => {
      const { guard } = guardWith(() => robots('boom', 503))

      await expect(guard.check(new URL('https://example.com/'))).resolves.toMatchObject({ allowed: false })
   })

   it('should treat a network failure as disallow all', async () => {
      const { guard } = guardWith(() => Promise.reject(new Error('connection refused')))

      await expect(guard.check(new URL('https://example.com/'))).resolves.toMatchObject({ allowed: false })
   })

   it('should fetch robots.txt once per origin within the cache time', async () => {
      const { guard, fetcher } = guardWith(() => robots('User-agent: *\nAllow: /\n'))

      await guard.check(new URL('https://example.com/a'))
      await guard.check(new URL('https://example.com/b'))
      await guard.check(new URL('https://other.example.com/a'))

      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher).toHaveBeenCalledWith('https://example.com/robots.txt', expect.anything())
   })

   it('should fetch again after the cache time has passed', async () => {
      let time = 0
      const { guard, fetcher } = guardWith(
         () => robots('User-agent: *\nAllow: /\n'),
         () => time
      )

      await guard.check(new URL('https://example.com/a'))
      time = 61_000
      await guard.check(new URL('https://example.com/a'))

      expect(fetcher).toHaveBeenCalledTimes(2)
   })

   it('should recheck a failed robots.txt sooner than a good one', async () => {
      let time = 0
      let status = 503
      const { guard, fetcher } = guardWith(
         () => robots('User-agent: *\nAllow: /\n', status),
         () => time
      )

      await expect(guard.check(new URL('https://example.com/'))).resolves.toMatchObject({ allowed: false })
      status = 200
      time = 31_000

      await expect(guard.check(new URL('https://example.com/'))).resolves.toMatchObject({ allowed: true })
      expect(fetcher).toHaveBeenCalledTimes(2)
   })
})
