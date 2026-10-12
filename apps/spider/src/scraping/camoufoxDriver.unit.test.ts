import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'

const mocks = vi.hoisted(() => {
   const page = {}
   const context = {
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      route: vi.fn(),
      newPage: vi.fn(async () => page),
   }
   const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
   }

   return {
      browser,
      context,
      camoufox: vi.fn(async () => browser),
   }
})

vi.mock('camoufox', () => ({ Camoufox: mocks.camoufox }))

const driver = new CamoufoxDriver({
   actionTimeoutMs: 1000,
   isAllowedNavigation: () => true,
})

describe('CamoufoxDriver', () => {
   beforeEach(() => {
      mocks.browser.newContext.mockClear()
      mocks.camoufox.mockClear()
   })

   it('should accept the certificate of a proxy that re-signs secure websites, as the owner decided', async () => {
      await driver.open({ proxy: { server: 'http://proxy.example.net:80' } })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({ ignoreHTTPSErrors: true })
   })

   it('should keep the normal certificate check when there is no proxy', async () => {
      await driver.open()

      expect(mocks.browser.newContext).toHaveBeenCalledWith({})
   })

   it('should start the browser through the proxy and never fall back to a direct connection', async () => {
      mocks.camoufox.mockRejectedValueOnce(new Error('boom'))

      await expect(driver.open({ proxy: { server: 'http://proxy.example.net:80' } })).rejects.toThrow(
         'The browser could not start through the proxy'
      )
   })
})
