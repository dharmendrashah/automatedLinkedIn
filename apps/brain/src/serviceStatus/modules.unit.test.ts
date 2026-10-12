import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type StatusConfig, buildModules } from './modules'

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
   spiderApiUrl: 'http://spider-api:3002/health',
   spiderWorkerUrl: 'http://spider-worker:3003/health',
   authentikWorkerDeployment: 'authentik-worker',
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
         ['Sign-in', 'signIn'],
         ['Sign-in', 'signInWorker'],
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
            spiderApiUrl: '',
            spiderWorkerUrl: '',
            authentikWorkerDeployment: '',
            smtp: null,
         })
      ).map(item => item.key)

      expect(keys).toEqual(['api', 'database', 'queue', 'proxyLookup'])
   })

   it('should leave out the worker and cloud storage together, since both come from the worker', () => {
      const keys = buildModules(config({ spiderWorkerUrl: '' })).map(item => item.key)

      expect(keys).not.toContain('spiderWorker')
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

   it('should ask the right address for the website, sign-in and spider API', async () => {
      const modules = buildModules(config())

      await find(modules, 'website').check()
      await find(modules, 'signIn').check()
      await find(modules, 'spiderApi').check()

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
         'http://body:80/health',
         'http://authentik-server:9000/-/health/ready/',
         'http://spider-api:3002/health',
      ])
   })

   it('should ask the spider worker once for both the worker and cloud storage', async () => {
      const modules = buildModules(config())

      const [worker, storage] = await Promise.all([
         find(modules, 'spiderWorker').check(),
         find(modules, 'storage').check(),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(worker).toEqual({ state: 'live' })
      expect(storage).toEqual({ state: 'live' })
   })

   it.each([
      [
         {
            broker: 'down',
            consuming: true,
            storage: 'up',
         },
         'dead',
      ],
      [
         {
            broker: 'up',
            consuming: false,
            storage: 'up',
         },
         'dead',
      ],
   ])('should call the worker dead when it says %j', async (report, state) => {
      fetchMock.mockResolvedValue({
         ok: false,
         status: 503,
         json: async () => report,
      })

      await expect(find(buildModules(config()), 'spiderWorker').check()).resolves.toMatchObject({ state })
   })

   it('should call cloud storage dead when the worker says the bucket cannot be read', async () => {
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => ({
            broker: 'up',
            consuming: true,
            storage: 'down',
         }),
      })

      await expect(find(buildModules(config()), 'storage').check()).resolves.toMatchObject({ state: 'dead' })
   })

   it('should call cloud storage unknown, never live, when the worker cannot be reached', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      const modules = buildModules(config())

      await expect(find(modules, 'spiderWorker').check()).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
      await expect(find(modules, 'storage').check()).resolves.toEqual({
         state: 'unknown',
         reason: 'Cannot be checked while the spider worker is not answering',
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
