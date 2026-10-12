export interface Clock {
   now: () => number
   sleep: (ms: number) => Promise<void>
}

const systemClock: Clock = {
   now: () => Date.now(),
   sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

// Keeps a fixed minimum gap between two actions on the same host. The gap is constant on purpose:
// this is politeness toward the site, not an attempt to look like a person.
export class HostRateLimiter {
   private readonly lastAt = new Map<string, number>()

   private readonly gaps = new Map<string, number>()

   public constructor(
      private readonly minDelayMs: number,
      private readonly clock: Clock = systemClock
   ) {}

   // A site's Crawl-delay can only make the gap longer than the configured minimum.
   public requireAtLeast(host: string, ms: number) {
      this.gaps.set(host, Math.max(this.gaps.get(host) ?? 0, ms))
   }

   public async wait(host: string) {
      const gap = Math.max(this.minDelayMs, this.gaps.get(host) ?? 0)
      const last = this.lastAt.get(host)

      if (last !== undefined) {
         const remaining = gap - (this.clock.now() - last)

         if (remaining > 0) {
            await this.clock.sleep(remaining)
         }
      }

      this.lastAt.set(host, this.clock.now())
   }
}
