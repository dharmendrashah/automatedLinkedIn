import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StatusService } from './statusService'

const mocks = vi.hoisted(() => ({
   databaseHealthy: vi.fn(),
   brokerHealthy: vi.fn(),
}))

vi.mock('database', () => ({ PrismaService: { isHealthy: mocks.databaseHealthy } }))
vi.mock('core', () => ({
   MessageBroker: { isHealthy: mocks.brokerHealthy },
   CloudRunJob: { reading: vi.fn() },
   UploadFiles: { reachable: vi.fn() },
}))
vi.mock('env', () => ({
   STATUS_URL_WEBSITE: 'http://body:80/health',
   STATUS_URL_SIGN_IN: '',
   STATUS_URL_BRAIN_WORKER: '',
   STATUS_URL_SPIDER_API: '',
   CLOUD_RUN_JOB: '',
   SPIDER_GCS_BUCKET: '',
   AUTHENTIK_EMAIL__HOST: '',
   AUTHENTIK_EMAIL__PORT: 465,
   AUTHENTIK_EMAIL__USE_SSL: true,
   IPINFO_TOKEN: 'tok',
}))

beforeEach(() => {
   mocks.databaseHealthy.mockResolvedValue(true)
   mocks.brokerHealthy.mockResolvedValue(false)
   vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
         ok: true,
         status: 200,
      }))
   )
})

afterEach(() => {
   vi.unstubAllGlobals()
})

describe('StatusService', () => {
   it("should report brain's own settings: the modules that are configured, the database and the queue as brain sees them", async () => {
      const { overall, modules } = await StatusService.snapshot()

      expect(modules.map(item => [item.key, item.status])).toEqual([
         ['website', 'live'],
         ['api', 'live'],
         ['database', 'live'],
         ['queue', 'dead'],
         ['spiderWorker', 'unknown'],
         ['proxyLookup', 'live'],
      ])
      expect(overall).toBe('dead')
   })
})
