import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CdnFetchError } from '../core/cdnFetch'

import { Cdn } from './cdn'

const mocks = vi.hoisted(() => ({
   isSetUp: vi.fn(),
   store: vi.fn(),
   find: vi.fn(),
   claim: vi.fn(),
   saved: vi.fn(),
   release: vi.fn(),
}))

vi.mock('core', async () => {
   const url = await import('../core/cdnUrl')
   const { CdnFetchError } = await import('../core/cdnFetch')

   return {
      ...url,
      CdnFetchError,
      CdnFiles: {
         isSetUp: mocks.isSetUp,
         store: mocks.store,
      },
   }
})

vi.mock('database', () => ({
   CdnFileService: {
      find: mocks.find,
      claim: mocks.claim,
      saved: mocks.saved,
      release: mocks.release,
   },
}))

type Handler = (request: unknown, response: unknown) => Promise<unknown>

const REMOTE = 'https://media.licdn.com/dms/image/v2/abc?e=1&t=x'
const BUCKET_URL = 'gs://cdn/cache/media.licdn.com/jpg/2026/10/30/h.jpg'
const PUBLIC_URL = 'https://storage.googleapis.com/cdn/cache/media.licdn.com/jpg/2026/10/30/h.jpg'

const route = () => {
   let handler: Handler | undefined

   Cdn.config({
      get: (_path: string, registered: Handler) => {
         handler = registered
      },
   } as never)

   return async (url: unknown, ip = '1.1.1.1') => {
      const response = {
         statusCode: 200,
         body: undefined as unknown,
         location: undefined as string | undefined,
         headers: {} as Record<string, string>,
         status(code: number) {
            this.statusCode = code

            return this
         },
         set(name: string | Record<string, string>, value?: string) {
            Object.assign(this.headers, typeof name === 'string' ? { [name]: value } : name)

            return this
         },
         json(body: unknown) {
            this.body = body

            return this
         },
         redirect(code: number, location: string) {
            this.statusCode = code
            this.location = location

            return this
         },
      }

      await handler?.(
         {
            query: { url },
            ip,
         },
         response
      )

      return response
   }
}

const savedRow = {
   path: REMOTE,
   status: 'SAVED',
   bucketUrl: BUCKET_URL,
}

describe('GET /cdn', () => {
   const call = route()

   beforeEach(() => {
      vi.clearAllMocks()
      mocks.isSetUp.mockReturnValue(true)
      mocks.release.mockResolvedValue(undefined)
   })

   it('should redirect a saved file to its public address, cached for 30 days, without fetching', async () => {
      mocks.find.mockResolvedValue(savedRow)

      const response = await call(REMOTE)

      expect(response.statusCode).toBe(302)
      expect(response.location).toBe(PUBLIC_URL)
      expect(response.headers['Cache-Control']).toBe('public, max-age=2592000')
      expect(mocks.store).not.toHaveBeenCalled()
   })

   it('should fetch, save and redirect a new file', async () => {
      mocks.find.mockResolvedValue(null)
      mocks.claim.mockResolvedValue({ bucketUrl: null })
      mocks.store.mockResolvedValue({
         bucketUrl: BUCKET_URL,
         contentType: 'image/jpeg',
         size: 3,
      })

      const response = await call(REMOTE)

      expect(mocks.claim).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{32}$/), REMOTE)
      expect(mocks.saved).toHaveBeenCalledWith(expect.any(String), {
         bucketUrl: BUCKET_URL,
         contentType: 'image/jpeg',
         size: 3,
      })
      expect(response.statusCode).toBe(302)
      expect(response.location).toBe(PUBLIC_URL)
   })

   it('should fetch a deleted file again into the key it had', async () => {
      mocks.find.mockResolvedValue({
         ...savedRow,
         status: 'DELETED',
      })
      mocks.claim.mockResolvedValue({ bucketUrl: BUCKET_URL })
      mocks.store.mockResolvedValue({
         bucketUrl: BUCKET_URL,
         contentType: 'image/jpeg',
         size: 3,
      })

      await call(REMOTE)

      expect(mocks.store).toHaveBeenCalledWith(expect.any(URL), expect.any(String), BUCKET_URL)
   })

   it.each([undefined, ['https://a.com/x', 'https://b.com/y'], 'http://a.com/x', 'https://10.0.0.1/x'])(
      'should answer 400 for %j',
      async url => {
         const response = await call(url)

         expect(response.statusCode).toBe(400)
         expect(response.headers['Cache-Control']).toBe('no-store')
      }
   )

   it('should answer 503 where no bucket is set up', async () => {
      mocks.isSetUp.mockReturnValue(false)

      expect((await call(REMOTE)).statusCode).toBe(503)
   })

   it('should never serve the file of another address with the same hash', async () => {
      mocks.find.mockResolvedValue({
         ...savedRow,
         path: 'https://other.com/x',
      })

      expect((await call(REMOTE)).statusCode).toBe(409)
   })

   it.each([
      ['NOT_FOUND', 404],
      ['REFUSED', 403],
      ['TOO_BIG', 413],
      ['TIMEOUT', 504],
      ['BAD_GATEWAY', 502],
   ] as const)('should give the claim back and answer %s as %i', async (reason, status) => {
      mocks.find.mockResolvedValue(null)
      mocks.claim.mockResolvedValue({ bucketUrl: null })
      mocks.store.mockRejectedValue(new CdnFetchError(reason))

      const response = await call(REMOTE)

      expect(response.statusCode).toBe(status)
      expect(response.headers['Cache-Control']).toBe('no-store')
      expect(mocks.release).toHaveBeenCalled()
      expect(mocks.saved).not.toHaveBeenCalled()
   })

   it('should wait for a fetch another pod is running and redirect when it is saved', async () => {
      mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce(savedRow)
      mocks.claim.mockResolvedValue(null)

      const response = await call(REMOTE)

      expect(response.statusCode).toBe(302)
      expect(mocks.store).not.toHaveBeenCalled()
   })

   it('should ask to try again when the other fetch failed', async () => {
      mocks.find.mockResolvedValue(null)
      mocks.claim.mockResolvedValue(null)

      const response = await call(REMOTE)

      expect(response.statusCode).toBe(503)
      expect(response.headers['Retry-After']).toBe('5')
   })

   it('should fetch a file once when two calls ask at the same time', async () => {
      mocks.find.mockResolvedValue(null)
      mocks.claim.mockResolvedValue({ bucketUrl: null })
      mocks.store.mockResolvedValue({
         bucketUrl: BUCKET_URL,
         contentType: 'image/jpeg',
         size: 3,
      })

      const [first, second] = await Promise.all([call(REMOTE), call(REMOTE)])

      expect([first.statusCode, second.statusCode]).toEqual([302, 302])
      expect(mocks.store).toHaveBeenCalledTimes(1)
   })

   it('should limit new files to 60 a minute per caller, but never saved ones', async () => {
      mocks.find.mockResolvedValue(null)
      mocks.claim.mockResolvedValue({ bucketUrl: null })
      mocks.store.mockRejectedValue(new CdnFetchError('NOT_FOUND'))

      for (let index = 0; index < 60; index += 1) {
         await call(`https://a.com/${index}`, '9.9.9.9')
      }

      const limited = await call('https://a.com/61', '9.9.9.9')

      expect(limited.statusCode).toBe(429)
      expect(limited.headers['Retry-After']).toBe('60')

      mocks.find.mockResolvedValue({
         ...savedRow,
         path: 'https://a.com/62',
      })

      expect((await call('https://a.com/62', '9.9.9.9')).statusCode).toBe(302)
   })
})
