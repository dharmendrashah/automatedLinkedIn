import { randomUUID } from 'node:crypto'

import { StandardTaskQueue } from 'core'

import { PrismaService } from './prisma.service'
import { ProxyServerOwnershipError, ProxyServerService } from './proxyServer.service'
import { type BrowserTestTrigger, SpiderSessionService } from './spiderSession.service'

const MINUTE_MS = 60 * 1000

// Two tests of one proxy are this far apart at least: each one shows the proxy's address to third party sites.
const WAIT_MS = 5 * MINUTE_MS

// A test that has not been answered after this long is not running any more, so it cannot block the next one.
const STALE_AFTER_MS = 30 * MINUTE_MS

// A proxy that is tested again and again is browser tested at most this often, unless its connection changed.
const AUTOMATIC_EVERY_MS = 24 * 60 * MINUTE_MS

const NEEDS_WORKING_PROXY = 'Test the proxy first: a browser test needs a working proxy.'

const NOT_QUEUED_MESSAGE = 'The browser test could not be queued. Try again in a moment.'

// A request that is refused, with the reason in words the owner can read.
export class BrowserTestRefusedError extends Error {}

class SkippedError extends BrowserTestRefusedError {}

// The browser detection test: the spider opens its browser through one of the user's proxies and checks whether bot
// detection pages take it for a person. See .plan/spider-browser-test.md.
export class BrowserTestService {
   // The owner asks for a test. Throws ProxyServerOwnershipError for a proxy that is not theirs and
   // BrowserTestRefusedError with a sentence when it cannot run now.
   public static requestForUser(userId: string, proxyId: string) {
      return this.start(proxyId, 'manual', { userId })
   }

   // A proxy just tested ok: test its browser too, unless that was done in the last 24 hours. `changed` is true when
   // the owner edited the connection, which makes an older result worthless. It never throws: the proxy is already saved.
   // Resolves to whether a test was queued.
   public static async requestAutomatic(proxyId: string, { changed = false }: { changed?: boolean } = {}) {
      try {
         await this.start(proxyId, 'automatic', { changed })

         return true
      } catch (error) {
         if (!(error instanceof SkippedError) && !(error instanceof BrowserTestRefusedError)) {
            console.error(`Could not request the browser test of proxy ${proxyId}: ${(error as Error).message}`)
         }

         return false
      }
   }

   private static async start(
      proxyId: string,
      trigger: BrowserTestTrigger,
      { userId, changed = false }: { userId?: string; changed?: boolean }
   ) {
      const proxy = await PrismaService.client.proxyServer.findFirst({
         where: {
            id: proxyId,
            ...(userId && { linkedInAccount: { userId } }),
         },
         select: {
            id: true,
            linkedInAccountId: true,
            status: true,
            linkedInAccount: { select: { userId: true } },
         },
      })

      if (!proxy) {
         throw new ProxyServerOwnershipError()
      }

      if (proxy.status !== 'ACTIVE' && proxy.status !== 'GEO_MISMATCH') {
         throw new BrowserTestRefusedError(NEEDS_WORKING_PROXY)
      }

      const last = await PrismaService.client.spiderSession.findFirst({
         where: {
            proxyServerId: proxy.id,
            kind: 'BROWSER_TEST',
         },
         orderBy: { startedAt: 'desc' },
         select: {
            status: true,
            startedAt: true,
         },
      })

      if (last) {
         const age = Date.now() - last.startedAt.getTime()

         if (last.status === 'IN_PROGRESS' && age < STALE_AFTER_MS) {
            throw new BrowserTestRefusedError('A browser test of this proxy is already running.')
         }

         if (age < WAIT_MS) {
            const minutes = Math.ceil((WAIT_MS - age) / MINUTE_MS)

            throw new BrowserTestRefusedError(`Wait ${minutes} minute(s) before testing this proxy again.`)
         }

         if (trigger === 'automatic' && !changed && age < AUTOMATIC_EVERY_MS) {
            throw new SkippedError('This proxy was browser tested in the last 24 hours.')
         }
      }

      const picked = await ProxyServerService.pickForAccount(proxy.linkedInAccountId, proxy.id)

      if (!picked) {
         throw new BrowserTestRefusedError(NEEDS_WORKING_PROXY)
      }

      const id = randomUUID()

      await SpiderSessionService.startBrowserTest({
         id,
         userId: proxy.linkedInAccount.userId,
         linkedInAccountId: proxy.linkedInAccountId,
         proxy: picked.summary,
         trigger,
      })

      try {
         await StandardTaskQueue.publish({
            task: 'browser_detection',
            task_id: id,
            // Forwarded as stored: the worker masks it in every recording and log.
            proxy: picked.config,
            requested_at: new Date().toISOString(),
         })
      } catch (error) {
         console.error(`Could not queue the browser test of proxy ${proxy.id}: ${(error as Error).message}`)

         try {
            await SpiderSessionService.fail(id, NOT_QUEUED_MESSAGE)
         } catch {
            // The session stays in progress and shows as having no answer.
         }

         throw new BrowserTestRefusedError(NOT_QUEUED_MESSAGE)
      }

      return { id }
   }
}
