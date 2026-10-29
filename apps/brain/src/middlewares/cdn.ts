import { type Application } from 'express'

import { CdnFetchError, type CdnFetchFailure, CdnFiles, parseRemoteUrl, publicUrlOf, urlHash } from 'core'

import { CdnFileService } from 'database'

// GET /cdn?url=<encodeURIComponent(remote url)>: a 302 to the public copy of a remote file, fetched and kept the first time
// (.plan/cdn-public-endpoint.md). Public on purpose: an <img src> sends no token.

// The redirect is cached for 30 days: a hash keeps its key for good, so brain is asked about a file once per browser.
const REDIRECT_CACHE_CONTROL = 'public, max-age=2592000'
const WAIT_MS = 10_000
const POLL_MS = 500
const MISSES_PER_MINUTE = 60
const MAX_TRACKED_CLIENTS = 10_000

const FAILURES: Record<CdnFetchFailure, [number, string]> = {
   NOT_FOUND: [404, 'The remote file does not exist.'],
   REFUSED: [403, 'That address may not be fetched.'],
   TOO_BIG: [413, 'The remote file is too big.'],
   TIMEOUT: [504, 'The remote server took too long.'],
   BAD_GATEWAY: [502, 'The remote server did not answer with the file.'],
}

class Refusal extends Error {
   public readonly status: number
   public readonly retryAfter: number | undefined

   public constructor(status: number, message: string, retryAfter?: number) {
      super(message)
      this.status = status
      this.retryAfter = retryAfter
   }
}

// Fetches running in this pod, by hash, so one pod never fetches the same file twice at once.
const inFlight = new Map<string, Promise<string>>()
const misses = new Map<string, { count: number; resetAt: number }>()

const allowMiss = (client: string) => {
   const now = Date.now()

   if (misses.size > MAX_TRACKED_CLIENTS) {
      for (const [key, window] of misses) {
         if (window.resetAt <= now) {
            misses.delete(key)
         }
      }
   }

   const window = misses.get(client)

   if (!window || window.resetAt <= now) {
      misses.set(client, {
         count: 1,
         resetAt: now + 60_000,
      })

      return true
   }

   window.count += 1

   return window.count <= MISSES_PER_MINUTE
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Another call (another pod) is fetching it: wait for its row to be saved.
const waitForOther = async (hash: string) => {
   for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS)

      const row = await CdnFileService.find(hash)

      if (row?.status === 'SAVED' && row.bucketUrl) {
         return row.bucketUrl
      }

      if (row?.status !== 'PENDING') {
         break
      }
   }

   throw new Refusal(503, 'The file is being fetched; try again shortly.', 5)
}

const fetchAndSave = async (url: URL, hash: string) => {
   const claimed = await CdnFileService.claim(hash, url.href)

   if (!claimed) {
      return waitForOther(hash)
   }

   try {
      const stored = await CdnFiles.store(url, hash, claimed.bucketUrl)

      await CdnFileService.saved(hash, stored)

      return stored.bucketUrl
   } catch (error) {
      await CdnFileService.release(hash).catch((releaseError: unknown) => {
         console.error('cdn: could not release a claim', hash, releaseError)
      })

      throw error
   }
}

const resolve = async (url: URL, hash: string, client: string) => {
   const row = await CdnFileService.find(hash)

   // MD5 collisions can be made on purpose; a different URL never gets another URL's file.
   if (row && row.path !== url.href) {
      throw new Refusal(409, 'This address cannot be cached.')
   }

   if (row?.status === 'SAVED' && row.bucketUrl) {
      return row.bucketUrl
   }

   const running = inFlight.get(hash)

   if (running) {
      return running
   }

   if (!allowMiss(client)) {
      throw new Refusal(429, `At most ${MISSES_PER_MINUTE} new files a minute.`, 60)
   }

   const job = fetchAndSave(url, hash).finally(() => inFlight.delete(hash))

   inFlight.set(hash, job)

   return job
}

export class Cdn {
   public static config(app: Application) {
      app.get('/cdn', async (request, response) => {
         const fail = (status: number, error: string, retryAfter?: number) => {
            response.set('Cache-Control', 'no-store')

            if (retryAfter) {
               response.set('Retry-After', String(retryAfter))
            }

            return response.status(status).json({ error })
         }
         const url = parseRemoteUrl(request.query.url)

         if (!url) {
            return fail(400, 'Send one https address in url, encoded once.')
         }

         if (!CdnFiles.isSetUp()) {
            return fail(503, 'The file cache is not set up here.')
         }

         const hash = urlHash(url)

         try {
            const bucketUrl = await resolve(url, hash, request.ip ?? '')

            response.set({
               'Cache-Control': REDIRECT_CACHE_CONTROL,
               'Referrer-Policy': 'no-referrer',
            })

            return response.redirect(302, publicUrlOf(bucketUrl))
         } catch (error) {
            if (error instanceof Refusal) {
               return fail(error.status, error.message, error.retryAfter)
            }

            if (error instanceof CdnFetchError) {
               const [status, message] = FAILURES[error.reason]

               return fail(status, message)
            }

            // Host and hash only: the query of a remote URL can hold tokens.
            console.error('cdn: could not cache a file', url.hostname, hash, error)

            return fail(500, 'The file could not be cached.')
         }
      })
   }
}
