import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type SpiderJobReading, type StatusConfig, buildModules, coveredWorkloads } from './modules'

const fetchMock = vi.fn()

beforeEach(() => {
   fetchMock.mockReset()
   fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
         broker: 'up',
         consuming: true,
         storage: 'up',
      }),
   })
   vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
   vi.unstubAllGlobals()
})

const config = (overrides: Partial<StatusConfig> = {}): StatusConfig => ({
   websiteUrl: 'http://body:80/health',
   signInUrl: 'http://authentik-server:9000/-/health/ready/',
   brainWorkerUrl: 'http://brain-worker:3004/health',
   spiderApiUrl: 'http://spider-api:3002/health',
   spiderWorker: async () => ({
      found: true,
      ready: true,
      lastRunFailedAt: null,
   }),
   bucketIsReachable: async () => true,
   smtp: {
      host: 'smtp.resend.com',
      port: 465,
      tls: true,
   },
   ipInfoToken: 'tok',
   databaseIsHealthy: async () => true,
   brokerIsHealthy: async () => true,
   ...overrides,
})

const find = (modules: ReturnType<typeof buildModules>, key: string) => {
   const found = modules.find(item => item.key === key)

   if (!found) {
      throw new Error(`No module ${key}`)
   }

   return found
}

describe('buildModules', () => {
   it('should list every module the product needs, grouped for reading', () => {
      expect(buildModules(config()).map(({ key, group }) => [group, key])).toEqual([
         ['The app', 'website'],
         ['The app', 'api'],
         ['The app', 'database'],
         ['The app', 'brainWorker'],
         ['Sign-in', 'signIn'],
         ['Sign-in', 'email'],
         ['The spider', 'queue'],
         ['The spider', 'spiderApi'],
         ['The spider', 'spiderWorker'],
         ['The spider', 'storage'],
         ['Outside services', 'proxyLookup'],
      ])
   })

   it('should give every module a name and a one-line description in plain words', () => {
      for (const { name, description } of buildModules(config())) {
         expect(name.length).toBeGreaterThan(2)
         expect(description.length).toBeGreaterThan(10)
      }
   })

   it('should leave out a module whose address is empty, because that deployment does not have it', () => {
      const keys = buildModules(
         config({
            websiteUrl: '',
            signInUrl: '',
            brainWorkerUrl: '',
            spiderApiUrl: '',
            spiderWorker: null,
            bucketIsReachable: null,
            smtp: null,
         })
      ).map(item => item.key)

      expect(keys).toEqual(['api', 'database', 'queue', 'spiderWorker', 'proxyLookup'])
   })

   it('should say which Kubernetes workloads the modules cover, so discovery adds no second card for them', () => {
      expect(coveredWorkloads(buildModules(config()))).toEqual(
         new Set(['body', 'brain', 'brain-worker', 'authentik-server', 'rabbitmq', 'spider-api'])
      )
   })

   it('should leave out cloud storage when the deployment has no bucket', () => {
      const keys = buildModules(config({ bucketIsReachable: null })).map(item => item.key)

      expect(keys).toContain('spiderWorker')
      expect(keys).not.toContain('storage')
   })

   it('should always say the API is live, since it is the one answering', async () => {
      await expect(find(buildModules(config()), 'api').check()).resolves.toEqual({ state: 'live' })
   })

   it.each([
      ['database', 'databaseIsHealthy'],
      ['queue', 'brokerIsHealthy'],
   ] as const)("should follow brain's own check for the %s", async (key, option) => {
      const modules = (check: () => Promise<boolean>) => buildModules(config({ [option]: check }))

      await expect(
         find(
            modules(async () => true),
            key
         ).check()
      ).resolves.toEqual({ state: 'live' })
      await expect(
         find(
            modules(async () => false),
            key
         ).check()
      ).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
      await expect(
         find(
            modules(async () => Promise.reject(new Error('boom'))),
            key
         ).check()
      ).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
   })

   it('should ask the right address for the website, sign-in, brain worker and spider API', async () => {
      const modules = buildModules(config())

      await find(modules, 'website').check()
      await find(modules, 'signIn').check()
      await find(modules, 'brainWorker').check()
      await find(modules, 'spiderApi').check()

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
         'http://body:80/health',
         'http://authentik-server:9000/-/health/ready/',
         'http://brain-worker:3004/health',
         'http://spider-api:3002/health',
      ])
   })

   it('should call the brain worker dead when its health answers 503, since it is not applying results', async () => {
      fetchMock.mockResolvedValue({
         ok: false,
         status: 503,
      })

      await expect(find(buildModules(config()), 'brainWorker').check()).resolves.toEqual({
         state: 'dead',
         reason: 'Reports an error',
      })
   })

   it('should call the spider worker live when its job is ready and its last run did not fail', async () => {
      await expect(find(buildModules(config()), 'spiderWorker').check()).resolves.toEqual({ state: 'live' })
   })

   it.each<[SpiderJobReading, string]>([
      [{ found: false }, 'The Cloud Run job does not exist'],
      [
         {
            found: true,
            ready: false,
            lastRunFailedAt: null,
         },
         'The Cloud Run job is not ready',
      ],
      [
         {
            found: true,
            ready: true,
            lastRunFailedAt: new Date(),
         },
         'The last run failed',
      ],
   ])('should call the spider worker dead when the job says %j', async (job, reason) => {
      const modules = buildModules(config({ spiderWorker: async () => job }))

      await expect(find(modules, 'spiderWorker').check()).resolves.toEqual({
         state: 'dead',
         reason,
      })
   })

   it('should call the spider worker live again an hour after a failed run, while the job is ready', async () => {
      const failedAnHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000)
      const job: () => Promise<SpiderJobReading> = async () => ({
         found: true,
         ready: true,
         lastRunFailedAt: failedAnHourAgo,
      })
      const modules = buildModules(config({ spiderWorker: job }))

      await expect(find(modules, 'spiderWorker').check()).resolves.toEqual({ state: 'live' })
   })

   it('should call the spider worker unknown when Google Cloud cannot be asked', async () => {
      const modules = buildModules(config({ spiderWorker: async () => Promise.reject(new Error('denied')) }))

      await expect(find(modules, 'spiderWorker').check()).resolves.toEqual({
         state: 'unknown',
         reason: 'Could not ask Google Cloud',
      })
   })

   it('should call the spider worker unknown, never live, where no job is set up', async () => {
      const modules = buildModules(config({ spiderWorker: null }))

      await expect(find(modules, 'spiderWorker').check()).resolves.toEqual({
         state: 'unknown',
         reason: 'Not set up in this deployment',
      })
   })

   it('should keep the spider worker answer for thirty seconds, so the page does not ask Google Cloud on every visit', () => {
      expect(find(buildModules(config()), 'spiderWorker').ttlMs).toBe(30_000)
   })

   it("should check cloud storage with brain's own bucket read", async () => {
      const modules = buildModules(config())

      await expect(find(modules, 'storage').check()).resolves.toEqual({ state: 'live' })
   })

   it('should call cloud storage dead when brain cannot read its bucket', async () => {
      const modules = buildModules(config({ bucketIsReachable: async () => Promise.reject(new Error('denied')) }))

      await expect(find(modules, 'storage').check()).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
   })

   it("should look up one fixed address at ipinfo.io with brain's token, and keep the answer for a minute", async () => {
      const lookup = find(buildModules(config()), 'proxyLookup')

      await lookup.check()

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.ipinfo.io/lite/8.8.8.8')
      expect(fetchMock.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer tok' })
      expect(lookup.ttlMs).toBe(60_000)
   })
})
