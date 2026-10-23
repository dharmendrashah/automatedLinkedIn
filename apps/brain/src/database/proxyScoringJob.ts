import { type JobItemInput } from './jobRun.service'
import { ProxyScoringService } from './proxyScoring.service'
import { ProxyServerService } from './proxyServer.service'

// One run never takes longer than this many proxies; the rest wait for the next hour.
const MAX_PER_RUN = 200
const RETRY_DELAY_MS = 60_000
// How long to stay quiet when AbuseIPDB refuses without saying for how long.
const DEFAULT_PAUSE_MS = 60 * 60 * 1000

const sleep = (ms: number) =>
   new Promise<void>(resolve => {
      setTimeout(resolve, ms)
   })

// The daily scoring of every proxy (.plan/proxy-ip-reputation.md). The brain worker calls `runDue` every hour, so a day
// missed while it was off (a restart, or staging switched off) is made up at the next wake-up. It needs the database, the
// encryption key for proxy passwords and the ipinfo token that brain already has.
export class ProxyScoringJob {
   private static running = false
   private static pausedUntil = 0

   public static async runDue(now: Date = new Date(), { retryDelayMs = RETRY_DELAY_MS } = {}) {
      const result = {
         scored: 0,
         failed: 0,
         items: [] as JobItemInput[],
      }

      if (ProxyScoringJob.running || now.getTime() < ProxyScoringJob.pausedUntil) {
         return result
      }

      ProxyScoringJob.running = true

      try {
         for (const proxy of await ProxyScoringService.findDue(now, MAX_PER_RUN)) {
            if (!(await ProxyScoringService.claim(proxy.id, proxy.scoredAt))) {
               continue
            }

            try {
               if (proxy.retest) {
                  const tested = await ProxyServerService.retest(proxy.id)

                  // One network blip must not drop a proxy that worked yesterday.
                  if (tested?.status === 'UNREACHABLE' && proxy.status !== 'UNREACHABLE') {
                     await sleep(retryDelayMs)
                     await ProxyServerService.retest(proxy.id)
                  }
               }

               const outcome = await ProxyScoringService.score(proxy.id)

               result.scored += 1
               result.items.push({
                  userId: proxy.userId,
                  accountId: proxy.accountId,
                  action: 'proxy-score',
                  result: 'ASKED',
                  reason: proxy.retest
                     ? 'Tested again and scored'
                     : 'Repeated the reputation lookup that failed earlier',
               })

               if (outcome.stop) {
                  ProxyScoringJob.pausedUntil =
                     now.getTime() + (outcome.retryAfterSeconds ? outcome.retryAfterSeconds * 1000 : DEFAULT_PAUSE_MS)
                  break
               }

               if (outcome.remaining === 0) {
                  break
               }
            } catch (error) {
               result.failed += 1
               result.items.push({
                  userId: proxy.userId,
                  accountId: proxy.accountId,
                  action: 'proxy-score',
                  result: 'FAILED',
                  reason: 'The test or the scoring failed; it is tried again on the next pass',
               })
               console.error(`Could not score proxy ${proxy.id}: ${(error as Error).message}`)
            }
         }
      } finally {
         ProxyScoringJob.running = false
      }

      return result
   }

   // Forgets a pause and a run in flight; for tests.
   public static reset() {
      ProxyScoringJob.running = false
      ProxyScoringJob.pausedUntil = 0
   }
}
