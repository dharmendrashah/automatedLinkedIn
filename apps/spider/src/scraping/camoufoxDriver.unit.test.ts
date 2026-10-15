import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Route } from 'playwright-core'

import { type DeviceIdentity } from '../identity/deviceIdentity'
import { CamoufoxDriver, allowedRoute } from './camoufoxDriver'

const mocks = vi.hoisted(() => {
   const events: string[] = []
   // What the field holds, as a page would keep it.
   const typed = { value: '' }
   const field = {
      click: vi.fn(async () => {
         events.push('field clicked')
      }),
      pressSequentially: vi.fn(async (text: string, _options?: unknown) => {
         typed.value += text
         events.push('field typed')
      }),
      inputValue: vi.fn(async () => typed.value),
      fill: vi.fn(async (text: string) => {
         typed.value = text
      }),
   }
   const page = {
      on: vi.fn(),
      screenshot: vi.fn(async (_options?: unknown) => Buffer.from('png')),
      content: vi.fn(async () => '<html>page</html>'),
      mouse: {
         wheel: vi.fn(async () => undefined),
         click: vi.fn(async (_x: number, _y: number) => undefined),
      },
      keyboard: {
         type: vi.fn(async (_text: string, _options?: unknown) => undefined),
         press: vi.fn(async (_key: string) => undefined),
      },
      evaluate: vi.fn(async (_script?: unknown): Promise<unknown> => undefined),
      waitForLoadState: vi.fn(async (_state?: string, _options?: unknown) => undefined),
      locator: vi.fn((_selector: string) => field),
      url: vi.fn(() => 'https://www.linkedin.com/feed/'),
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
      typed,
      field,
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
      mocks.typed.value = ''
      mocks.field.pressSequentially.mockClear()
      mocks.field.fill.mockClear()
   })

   it('should accept the certificate of a proxy that re-signs secure websites, as the owner decided', async () => {
      await driver.open({ proxy: { server: 'http://proxy.example.net:80' } })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({ ignoreHTTPSErrors: true })
   })

   it('should keep the normal certificate check when there is no proxy', async () => {
      await driver.open()

      expect(mocks.browser.newContext).toHaveBeenCalledWith({})
   })

   it('should start from the cookies and local storage an account kept', async () => {
      const storageState = {
         cookies: [],
         origins: [
            {
               origin: 'https://www.linkedin.com',
               localStorage: [],
            },
         ],
      }

      await driver.open({ storageState })

      expect(mocks.browser.newContext).toHaveBeenCalledWith({ storageState })
   })

   it('should hand the proxy exit address it was given to Camoufox, so the address is not looked up twice', async () => {
      await driver.open({
         proxy: { server: 'http://proxy.example.net:80' },
         exitIp: '203.0.113.7',
      })

      expect(mocks.camoufox).toHaveBeenCalledWith(expect.objectContaining({ geoip: '203.0.113.7' }))
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

   it('should launch an account with the fingerprint, language and timezone its device was given, on every run', async () => {
      const identity = {
         version: 1 as const,
         os: 'windows' as const,
         fingerprint: {
            screen: { width: 1366 },
            navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:150.0) Gecko/20100101 Firefox/150.0' },
         } as DeviceIdentity['fingerprint'],
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
         createdAt: '2026-10-15T10:00:00.000Z',
      }

      await driver.open({
         proxy: { server: 'http://proxy.example.net:80' },
         identity,
      })
      await driver.open({
         proxy: { server: 'http://proxy.example.net:80' },
         identity,
      })

      const [first, second] = mocks.camoufox.mock.calls.map(([options]) => options)

      expect(first).toEqual(second)
      expect(first).toMatchObject({
         fingerprint: identity.fingerprint,
         locale: 'de-DE',
         config: { timezone: 'Europe/Berlin' },
         geoip: true,
      })
   })

   it('should leave the language and timezone to the proxy until the device has them', async () => {
      await driver.open({
         proxy: { server: 'http://proxy.example.net:80' },
         identity: {
            version: 1,
            os: 'windows',
            fingerprint: {
               screen: { width: 1366 },
               navigator: { userAgent: 'Mozilla/5.0' },
            } as DeviceIdentity['fingerprint'],
            createdAt: '2026-10-15T10:00:00.000Z',
         },
      })

      const options = mocks.camoufox.mock.calls[0]?.[0] as Record<string, unknown>

      expect(options.locale).toBeUndefined()
      expect(options.config).toBeUndefined()
      expect(options.geoip).toBe(true)
   })

   it('should hand out what the page, an iframe and a worker each report about the browser', async () => {
      const session = await driver.open()
      const facts = {
         userAgent: 'Mozilla/5.0',
         platform: 'Win32',
         language: 'de-DE',
         languages: 'de-DE,de',
         timezone: 'Europe/Berlin',
         hardwareConcurrency: 8,
      }

      mocks.page.evaluate.mockResolvedValueOnce({
         window: facts,
         iframe: facts,
         worker: facts,
      })

      await expect(session.probe?.()).resolves.toEqual({
         window: facts,
         iframe: facts,
         worker: facts,
      })
   })

   it('should give the owner a picture of the page, a click placed by fraction, text, keys and a scroll', async () => {
      const session = await driver.open()

      mocks.page.evaluate.mockResolvedValue({
         width: 1280,
         height: 720,
      })

      const frame = await session.control?.frame()

      expect(frame).toMatchObject({
         width: 1280,
         height: 720,
      })
      expect(mocks.page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ type: 'jpeg' }))

      await session.control?.click(0.5, 0.25)
      await session.control?.type('123456')
      await session.control?.press('Enter')
      await session.control?.scroll(300)

      expect(mocks.page.mouse.click).toHaveBeenCalledWith(640, 180)
      expect(mocks.page.keyboard.type).toHaveBeenCalledWith('123456', expect.anything())
      expect(mocks.page.keyboard.press).toHaveBeenCalledWith('Enter')
      expect(mocks.page.mouse.wheel).toHaveBeenCalledWith(0, 300)

      mocks.page.evaluate.mockReset()
   })

   it('should wait for the redirects after a submit and say where the browser is, even when the page never goes quiet', async () => {
      const session = await driver.open()

      await expect(session.settled?.()).resolves.toBe('https://www.linkedin.com/feed/')
      expect(mocks.page.waitForLoadState).toHaveBeenCalledWith(
         'networkidle',
         expect.objectContaining({ timeout: 4000 })
      )

      mocks.page.waitForLoadState.mockRejectedValueOnce(new Error('Timeout 4000ms exceeded'))

      await expect(session.settled?.()).resolves.toBe('https://www.linkedin.com/feed/')
   })

   it('should click a field before it types into it, so the keys go to that field and not to the one before', async () => {
      const session = await driver.open()

      mocks.events.length = 0

      await session.fill('#password', 'hunter2')

      expect(mocks.page.locator).toHaveBeenCalledWith('#password')
      expect(mocks.field.pressSequentially).toHaveBeenCalledWith('hunter2', expect.anything())
      expect(mocks.events).toEqual(['field clicked', 'field typed'])
   })

   it('should type again when the page kept only the start of what was typed, and send nothing cut', async () => {
      const session = await driver.open()

      mocks.field.pressSequentially.mockImplementationOnce(async text => {
         mocks.typed.value = text.slice(0, 9)
      })

      await session.fill('#username', 'amani_farley@onet.pl')

      expect(mocks.field.pressSequentially).toHaveBeenCalledTimes(2)
      expect(mocks.field.fill).toHaveBeenCalledWith('')
      expect(mocks.typed.value).toBe('amani_farley@onet.pl')
   })

   it('should give up, without quoting the text, when the field never keeps it', async () => {
      const session = await driver.open()

      mocks.field.pressSequentially.mockImplementation(async text => {
         mocks.typed.value = text.slice(0, 3)
      })

      try {
         const failure = await session.fill('#password', 'hunter2-secret').catch((error: Error) => error)

         expect(failure).toBeInstanceOf(Error)
         expect((failure as Error).message).not.toContain('hunter2')
         expect(mocks.field.pressSequentially).toHaveBeenCalledTimes(3)
      } finally {
         mocks.field.pressSequentially.mockImplementation(async (text: string) => {
            mocks.typed.value += text
            mocks.events.push('field typed')
         })
      }
   })

   it('should press a key as a person would and say where the browser is afterwards', async () => {
      const session = await driver.open()

      await expect(session.press('Enter')).resolves.toBe('https://www.linkedin.com/feed/')
      expect(mocks.page.keyboard.press).toHaveBeenCalledWith('Enter')
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

describe('allowedRoute', () => {
   const request = (url: string, { navigation = true, main = true } = {}) => {
      const route = {
         request: () => ({
            url: () => url,
            isNavigationRequest: () => navigation,
            frame: () => ({ parentFrame: () => (main ? null : {}) }),
         }),
         abort: vi.fn(),
         continue: vi.fn(),
      }

      allowedRoute(host => host.startsWith('https://www.linkedin.com/'))(route as unknown as Route)

      return route
   }

   it('should block the page itself from loading an address that is not allowed', () => {
      const route = request('https://elsewhere.example/')

      expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
      expect(route.continue).not.toHaveBeenCalled()
   })

   it('should let a frame of an allowed page load, as the captcha of the sign-in is one', () => {
      const route = request('https://www.google.com/recaptcha/enterprise/anchor', { main: false })

      expect(route.continue).toHaveBeenCalled()
      expect(route.abort).not.toHaveBeenCalled()
   })

   it('should let an allowed page and anything that is not a page load through', () => {
      expect(request('https://www.linkedin.com/login').continue).toHaveBeenCalled()
      expect(request('https://cdn.example/app.js', { navigation: false }).continue).toHaveBeenCalled()
   })
})
