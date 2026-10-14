import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'

const mocks = vi.hoisted(() => {
   const events: string[] = []
   const page = {
      on: vi.fn(),
      screenshot: vi.fn(async (_options?: unknown) => Buffer.from('png')),
      content: vi.fn(async () => '<html>page</html>'),
      mouse: { wheel: vi.fn(async () => undefined) },
      evaluate: vi.fn(async (_script?: unknown): Promise<unknown> => undefined),
   }
   const context = {
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      route: vi.fn(),
      newPage: vi.fn(async () => page),
      storageState: vi.fn(
         async () =>
            ({
               cookies: [],
               origins: [],
            }) as unknown
      ),
      close: vi.fn(async () => {
         events.push('context closed')
      }),
   }
   const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
   }

   return {
      events,
      page,
      browser,
      context,
      camoufox: vi.fn(async (_options?: unknown) => browser),
   }
})

vi.mock('camoufox', () => ({ Camoufox: mocks.camoufox }))

const driver = new CamoufoxDriver({
   actionTimeoutMs: 1000,
   isAllowedNavigation: () => true,
})

const makeRecorder = (videoDir?: string, videoSize?: { width: number; height: number }) => ({
   videoDir,
   videoSize,
   log: vi.fn(),
   network: vi.fn(),
   track: vi.fn(),
   settle: vi.fn(async () => {
      mocks.events.push('settled')
   }),
})

describe('CamoufoxDriver', () => {
   beforeEach(() => {
      mocks.browser.newContext.mockClear()
      mocks.camoufox.mockClear()
      mocks.page.on.mockClear()
      mocks.events.length = 0
   })

   it('should accept the certificate of a proxy that re-signs secure websites, as the owner decided', async () => {
      await driver.open({ proxy: { server: 'http://proxy.example.net:80' } })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({ ignoreHTTPSErrors: true })
   })

   it('should keep the normal certificate check when there is no proxy', async () => {
      await driver.open()

      expect(mocks.browser.newContext).toHaveBeenCalledWith({})
   })

   it('should start the browser headless by default', async () => {
      await driver.open()

      expect(mocks.camoufox).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
   })

   it('should start the browser on a virtual display when that is set', async () => {
      await new CamoufoxDriver({
         actionTimeoutMs: 1000,
         isAllowedNavigation: () => true,
         headless: 'virtual',
      }).open()

      expect(mocks.camoufox).toHaveBeenCalledWith(expect.objectContaining({ headless: 'virtual' }))
   })

   it('should give Camoufox a Firefox desktop fingerprint from fingerprint-generator, on a screen of at most 1920 by 1080', async () => {
      await driver.open()

      const options = mocks.camoufox.mock.calls[0]?.[0] as {
         fingerprint: { navigator: { userAgent: string }; screen: { width: number; height: number } }
         os?: unknown
         screen?: unknown
      }

      expect(options.fingerprint.navigator.userAgent).toMatch(/Firefox\/.*|rv:\d+/)
      expect(options.fingerprint.navigator.userAgent).toMatch(/Windows|Macintosh|Linux/)
      expect(options.fingerprint.screen.width).toBeLessThanOrEqual(1920)
      expect(options.fingerprint.screen.height).toBeLessThanOrEqual(1080)
      // The constraints are in the generator call; Camoufox must not generate a second, different identity.
      expect(options.os).toBeUndefined()
      expect(options.screen).toBeUndefined()
   })

   it('should only claim the operating systems it is limited to', async () => {
      await new CamoufoxDriver({
         actionTimeoutMs: 1000,
         isAllowedNavigation: () => true,
         operatingSystems: ['macos'],
      }).open()

      const options = mocks.camoufox.mock.calls[0]?.[0] as { fingerprint: { navigator: { userAgent: string } } }

      expect(options.fingerprint.navigator.userAgent).toMatch(/Macintosh/)
   })

   it('should start the browser through the proxy and never fall back to a direct connection', async () => {
      mocks.camoufox.mockRejectedValueOnce(new Error('boom'))

      await expect(driver.open({ proxy: { server: 'http://proxy.example.net:80' } })).rejects.toThrow(
         'The browser could not start through the proxy'
      )
   })

   it('should record a video in the recorder folder and watch the page when a recorder is given', async () => {
      const recorder = makeRecorder('/tmp/rec')

      await driver.open({ recorder })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({ recordVideo: { dir: '/tmp/rec' } })
      expect(mocks.page.on).toHaveBeenCalledWith('response', expect.any(Function))
      expect(mocks.page.on).toHaveBeenCalledWith('console', expect.any(Function))
   })

   it('should record the video at the size the recorder asks for', async () => {
      await driver.open({
         recorder: makeRecorder('/tmp/rec', {
            width: 1280,
            height: 720,
         }),
      })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({
         recordVideo: {
            dir: '/tmp/rec',
            size: {
               width: 1280,
               height: 720,
            },
         },
      })
   })

   it('should scroll the page with the mouse wheel and say whether there is more below', async () => {
      const session = await driver.open()

      mocks.page.evaluate.mockResolvedValueOnce(true)

      await expect(session.scrollBy(600)).resolves.toBe(true)
      expect(mocks.page.mouse.wheel).toHaveBeenCalledWith(0, 600)

      mocks.page.evaluate.mockResolvedValueOnce(false)

      await expect(session.scrollBy(600)).resolves.toBe(false)
   })

   it('should hand out the cookies and the local storage the browser holds', async () => {
      const session = await driver.open()
      const state = {
         cookies: [
            {
               name: 'li_at',
               value: 'x',
               domain: '.linkedin.com',
               path: '/',
            },
         ],
         origins: [
            {
               origin: 'https://www.linkedin.com',
               localStorage: [
                  {
                     name: 'k',
                     value: 'v',
                  },
               ],
            },
         ],
      }

      mocks.context.storageState.mockResolvedValueOnce(state)

      await expect(session.storageState()).resolves.toEqual(state)
   })

   it('should hand out the visible text of the page, a picture of all of it, and what the browser reports', async () => {
      const session = await driver.open()

      mocks.page.evaluate.mockResolvedValueOnce('You are human!')

      await expect(session.pageText()).resolves.toBe('You are human!')

      await session.fullPageScreenshot()

      expect(mocks.page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true }))

      mocks.page.evaluate.mockResolvedValueOnce({
         userAgent: 'Mozilla/5.0',
         platform: 'Win32',
         screen: '1600x900',
      })

      await expect(session.identity()).resolves.toEqual({
         userAgent: 'Mozilla/5.0',
         platform: 'Win32',
         screen: '1600x900',
      })
   })

   it('should still accept the proxy certificate, next to the video, when both are set', async () => {
      await driver.open({
         proxy: { server: 'http://proxy.example.net:80' },
         recorder: makeRecorder('/tmp/rec'),
      })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({
         ignoreHTTPSErrors: true,
         recordVideo: { dir: '/tmp/rec' },
      })
   })

   it('should record no video when the recorder has no folder for one, but still watch the page', async () => {
      await driver.open({ recorder: makeRecorder() })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({})
      expect(mocks.page.on).toHaveBeenCalledWith('response', expect.any(Function))
   })

   it('should not watch the page when there is no recorder', async () => {
      await driver.open()

      expect(mocks.page.on).not.toHaveBeenCalled()
   })

   it('should log a failed start as a browser engine error, without the proxy credentials', async () => {
      const recorder = makeRecorder()

      mocks.camoufox.mockRejectedValueOnce(new Error('connect socks5://bob:hunter2@10.0.0.1:1080 refused'))

      await expect(
         driver.open({
            proxy: { server: 'socks5://10.0.0.1:1080' },
            recorder,
         })
      ).rejects.toThrow('The browser could not start through the proxy')

      expect(recorder.log).toHaveBeenCalledWith(
         'engine',
         'error',
         'Start failed: connect socks5://***@10.0.0.1:1080 refused'
      )
   })

   it('should hand out a screenshot and the html of the page', async () => {
      const session = await driver.open()

      await expect(session.screenshot?.()).resolves.toEqual(Buffer.from('png'))
      await expect(session.pageHtml?.()).resolves.toBe('<html>page</html>')
   })

   it('should let the pending captures finish before the browser closes, so the video is complete', async () => {
      const session = await driver.open({ recorder: makeRecorder('/tmp/rec') })

      await session.close()

      expect(mocks.events).toEqual(['settled', 'context closed'])
   })
})
