import robotsParser from 'robots-parser'

const FETCH_TIMEOUT_MS = 5000
// A failed lookup is retried sooner than a good one, so a short outage does not block a site for an hour.
const FAILURE_TTL_MS = 30_000

type Rules = {
   allowed: (url: string) => boolean
   crawlDelayMs: number | undefined
   expiresAt: number
}

export type RobotsDecision = {
   allowed: boolean
   crawlDelayMs?: number
}

// Reads robots.txt before a page is visited. Follows RFC 9309: a 4xx means "no rules", while a 5xx or an
// unreachable file means "do not crawl".
export class RobotsGuard {
   private readonly cache = new Map<string, Rules>()

   public constructor(
      private readonly userAgent: string,
      private readonly fetcher: typeof fetch = fetch,
      private readonly ttlMs = 3_600_000,
      private readonly now: () => number = () => Date.now()
   ) {}

   public async check(url: URL): Promise<RobotsDecision> {
      const rules = await this.rulesFor(url.origin)
      const allowed = rules.allowed(url.href)

      return rules.crawlDelayMs === undefined
         ? { allowed }
         : {
              allowed,
              crawlDelayMs: rules.crawlDelayMs,
           }
   }

   private async rulesFor(origin: string) {
      const cached = this.cache.get(origin)

      if (cached && cached.expiresAt > this.now()) {
         return cached
      }

      const rules = await this.load(origin)

      this.cache.set(origin, rules)

      return rules
   }

   private async load(origin: string): Promise<Rules> {
      const robotsUrl = `${origin}/robots.txt`

      try {
         const response = await this.fetcher(robotsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

         if (response.status >= 500) {
            return this.denyAll()
         }

         const body = response.ok ? await response.text() : ''
         const parsed = robotsParser(robotsUrl, body)
         const delay = parsed.getCrawlDelay(this.userAgent)

         return {
            allowed: url => parsed.isAllowed(url, this.userAgent) !== false,
            crawlDelayMs: delay === undefined ? undefined : delay * 1000,
            expiresAt: this.now() + this.ttlMs,
         }
      } catch {
         return this.denyAll()
      }
   }

   private denyAll(): Rules {
      return {
         allowed: () => false,
         crawlDelayMs: undefined,
         expiresAt: this.now() + FAILURE_TTL_MS,
      }
   }
}
