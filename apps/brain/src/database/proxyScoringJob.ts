import { ProxyScoringService } from './proxyScoring.service'
import { ProxyServerService } from './proxyServer.service'

const START_DELAY_MS = 60_000
const INTERVAL_MS = 60 * 60 * 1000
// One run never takes longer than this many proxies; the rest wait for the next hour.
const MAX_PER_RUN = 200
const RETRY_DELAY_MS = 60_000
// How long to stay quiet when AbuseIPDB refuses without saying for how long.
const DEFAULT_PAUSE_MS = 60 * 60 * 1000

const sleep = (ms: number) =>
   new Promise<void>(resolve => {
      setTimeout(resolve, ms)
   })

// The daily scoring of every proxy (.plan/proxy-ip-reputation.md). It wakes every hour and does what is due, so a day
// missed while brain was off (a restart, or staging switched off) is made up at the next wake-up. It runs inside brain
// because it needs the database, the encryption key for proxy passwords and the ipinfo token that brain already has.
export class ProxyScoringJob {
   private static running = false
   private static pausedUntil = 0
   private static first: NodeJS.Timeout | undefined
   private static every: NodeJS.Timeout | undefined

   public static async runDue(now: Date = new Date(), { retryDelayMs = RETRY_DELAY_MS } = {}) {
      const result = {
         scored: 0,
         failed: 0,
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
               console.error(`Could not score proxy ${proxy.id}: ${(error as Error).message}`)
            }
         }
      } finally {
         ProxyScoringJob.running = false
      }

      // The smart shutdown of staging counts brain's log lines as activity, so a quiet hour writes none.
      if (result.scored > 0 || result.failed > 0) {
         console.log(`proxy scoring: ${result.scored} scored, ${result.failed} failed`)
      }

      return result
   }

   public static start() {
      if (ProxyScoringJob.first || ProxyScoringJob.every) {
         return
      }

      ProxyScoringJob.first = setTimeout(() => {
         void ProxyScoringJob.runDue()
         ProxyScoringJob.every = setInterval(() => void ProxyScoringJob.runDue(), INTERVAL_MS)
         ProxyScoringJob.every.unref()
      }, START_DELAY_MS)
      ProxyScoringJob.first.unref()
   }

   public static stop() {
      clearTimeout(ProxyScoringJob.first)
      clearInterval(ProxyScoringJob.every)
      ProxyScoringJob.first = undefined
      ProxyScoringJob.every = undefined
   }

   // Forgets a pause and a run in flight; for tests.
   public static reset() {
      ProxyScoringJob.running = false
      ProxyScoringJob.pausedUntil = 0
   }
}
