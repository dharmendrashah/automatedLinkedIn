import { Camoufox } from 'camoufox'
import { FingerprintGenerator } from 'fingerprint-generator'

import { type Browser, type BrowserContext, type Page, type Route } from 'playwright-core'

import { type ExtractedRecord, type SessionCookie } from '../types'

import { type DeviceIdentity } from '../identity/deviceIdentity'
import { attachRecorder } from '../recording/attachRecorder'
import { maskText } from '../recording/masking'
import { type RunRecorder } from '../recording/recorder'
import {
   type BrowserDriver,
   type BrowserIdentity,
   type DetectionDriver,
   type DetectionSession,
   type LoginDriver,
   type OpenOptions,
   type ProbeReading,
   type SessionControl,
   type StorageState,
} from './driver'
import { TaskError } from './errors'

export type CamoufoxOptions = {
   actionTimeoutMs: number
   // Page loads to anything else are blocked in the browser, not only checked afterwards. Frames inside an allowed page
   // (a captcha, a sign-in button) are parts of that page and are not held to it.
   isAllowedNavigation: (url: string) => boolean
   // `virtual` runs a real browser on an Xvfb display, which Camoufox advises over plain headless; `false` is a real
   // window, for the local devtools recorder only (apps/spider/src/devtools) — production never sets it.
   headless?: true | 'virtual' | false
   // Limits the fingerprint to these systems. Only a run on a desktop passes it (see `newFingerprint`).
   operatingSystems?: FingerprintOs[]
   // Tests shorten how long closing the page may take; production keeps the default.
   closeTimeoutMs?: number
}

// The longest the cursor takes to glide to a point, in seconds. Camoufox's own 1.5 s made every click of a person taking over
// a run arrive more than a second late.
const HUMANIZE_MAX_S = 0.7

// The worker runs one page at a time, so one content process is enough; each extra one cost hundreds of MB and got the
// worker killed for memory on staging (2026-10-19). The memory cache is capped in case it is ever turned on.
const MEMORY_PREFS = {
   'dom.ipc.processCount': 1,
   'dom.ipc.processCount.webIsolated': 1,
   'browser.cache.memory.capacity': 16_384,
}

// What CamoufoxDriver passes to Camoufox(), shared with the local devtools recorder so both start the exact same
// browser identity instead of keeping two copies of these options. A stored `pin` (language, timezone) wins over what
// the proxy's address would draw, so one account does not change language between runs.
export const buildCamoufoxOptions = (
   headless: Exclude<CamoufoxOptions['headless'], undefined>,
   proxy: OpenOptions['proxy'],
   fingerprint = newFingerprint(),
   pin: Pick<DeviceIdentity, 'locale' | 'timezone'> = {},
   exitIp?: string
) => ({
   headless,
   humanize: HUMANIZE_MAX_S,
   // A copy: Camoufox writes its own prefs into this object.
   firefox_user_prefs: { ...MEMORY_PREFS },
   fingerprint,
   ...(pin.locale && { locale: pin.locale }),
   ...(pin.timezone && { config: { timezone: pin.timezone } }),
   ...(proxy && {
      proxy,
      geoip: exitIp ?? true,
   }),
})

// A page that is stuck should not hold up the screenshot of the step that failed.
const SNAPSHOT_TIMEOUT_MS = 5000
// The most closing the page and writing its video may take before the browser is closed anyway.
const CONTEXT_CLOSE_MS = 15_000

// Blocks a load of the page itself (and its redirects) to an address the operator did not allow. The frames an allowed page
// embeds are not checked: LinkedIn's captcha lives in a frame of google.com, and without it the check can never be passed.
export const allowedRoute = (isAllowed: (url: string) => boolean) => (route: Route) => {
   const request = route.request()

   return request.isNavigationRequest() && request.frame().parentFrame() === null && !isAllowed(request.url())
      ? route.abort('blockedbyclient')
      : route.continue()
}

// How long to wait for the redirects after a submit.
const SETTLE_TIMEOUT_MS = 4000

// How many times a field is typed into before the run gives up on it.
const FILL_ATTEMPTS = 3

// The fingerprint comes from Apify's fingerprint-generator: a Firefox desktop on Windows, macOS or Linux, on a screen
// of at most 1920 by 1080. Camoufox sets the version of its own build in it, so the user agent matches the browser.
const fingerprints = new FingerprintGenerator()

export type FingerprintOs = 'windows' | 'macos' | 'linux'

// On a macOS or Windows machine Camoufox draws on the real system fonts, so a fingerprint for another OS lists fonts
// the machine lacks and text renders as broken glyphs. A desktop run passes its own OS here; the Linux worker image
// bundles the fonts of every OS and keeps the default.
export const newFingerprint = (operatingSystems: FingerprintOs[] = ['windows', 'macos', 'linux']) =>
   fingerprints.getFingerprint({
      browsers: [{ name: 'firefox' }],
      operatingSystems,
      devices: ['desktop'],
      screen: {
         maxWidth: 1920,
         maxHeight: 1080,
      },
   }).fingerprint

class CamoufoxSession implements DetectionSession {
   public constructor(
      private readonly browser: Browser,
      private readonly context: BrowserContext,
      private readonly page: Page,
      private readonly recorder?: RunRecorder,
      private readonly closeTimeoutMs = CONTEXT_CLOSE_MS
   ) {}

   // The owner's hands on the page. Nothing here is recorded as a step: what they type could be a code or a password.
   public readonly control: SessionControl = {
      frame: async () => {
         const jpeg = await this.page.screenshot({
            type: 'jpeg',
            quality: 55,
            scale: 'css',
            timeout: SNAPSHOT_TIMEOUT_MS,
         })

         return {
            jpeg,
            ...(await this.viewport()),
         }
      },
      click: async (x, y) => {
         const { width, height } = await this.viewport()

         await this.page.mouse.click(x * width, y * height)
      },
      type: text => this.page.keyboard.type(text, { delay: 60 }),
      press: key => this.page.keyboard.press(key),
      scroll: dy => this.page.mouse.wheel(0, dy),
   }

   private viewport() {
      return this.page.evaluate(() => ({
         width: window.innerWidth,
         height: window.innerHeight,
      }))
   }

   public screenshot() {
      return this.page.screenshot({ timeout: SNAPSHOT_TIMEOUT_MS })
   }

   public pageHtml() {
      return this.page.content()
   }

   // The wheel, as a person scrolls, so the page sees real scroll events. True while there is more page below.
   public async scrollBy(pixels: number) {
      await this.page.mouse.wheel(0, pixels)

      return this.page.evaluate(() => window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 2)
   }

   public storageState() {
      return this.context.storageState() as Promise<StorageState>
   }

   public pageText() {
      return this.page.evaluate(() => document.body.innerText)
   }

   public fullPageScreenshot() {
      return this.page.screenshot({
         fullPage: true,
         timeout: SNAPSHOT_TIMEOUT_MS,
      })
   }

   public identity(): Promise<BrowserIdentity> {
      return this.page.evaluate(() => ({
         userAgent: navigator.userAgent,
         platform: navigator.platform,
         screen: `${screen.width}x${screen.height}`,
      }))
   }

   // Reads the same values in the page, in an iframe and in a worker, which is where a spoof that only patched the page's
   // own copy shows. A world that does not answer in time is left out.
   public probe(): Promise<ProbeReading> {
      return this.page.evaluate(async () => {
         const collect = (scope: { navigator: Navigator; Intl: typeof Intl }) => ({
            userAgent: scope.navigator.userAgent,
            platform: scope.navigator.platform,
            language: scope.navigator.language,
            languages: scope.navigator.languages.join(','),
            timezone: new scope.Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardwareConcurrency: scope.navigator.hardwareConcurrency,
            webdriver: scope.navigator.webdriver,
         })
         // The same code, run as a script of the iframe and of the worker, so each reads its own globals.
         const source = `(${collect.toString()})({ navigator, Intl })`
         type Facts = ReturnType<typeof collect>
         const timeout = <T>(work: Promise<T | undefined>) =>
            Promise.race([work, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 3000))])

         const frame = document.createElement('iframe')
         const inFrame = timeout(
            new Promise<Facts | undefined>(resolve => {
               window.addEventListener('message', event => {
                  if (event.source === frame.contentWindow) {
                     resolve(event.data)
                  }
               })
            })
         )

         frame.srcdoc = `<script>parent.postMessage(${source}, '*')</script>`
         document.body.appendChild(frame)

         const url = URL.createObjectURL(new Blob([`self.postMessage(${source})`], { type: 'text/javascript' }))
         const worker = new Worker(url)
         const inWorker = timeout(
            new Promise<Facts | undefined>(resolve => {
               worker.onmessage = event => resolve(event.data)
               worker.onerror = () => resolve(undefined)
            })
         )

         const [iframe, workerFacts] = await Promise.all([inFrame, inWorker])

         worker.terminate()
         URL.revokeObjectURL(url)
         frame.remove()

         return {
            window: collect({
               navigator,
               Intl,
            }),
            ...(iframe && { iframe }),
            ...(workerFacts && { worker: workerFacts }),
         }
      })
   }

   public async cookies(): Promise<SessionCookie[]> {
      const cookies = await this.context.cookies()

      return cookies.map(({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({
         name,
         value,
         domain,
         path,
         expires,
         httpOnly,
         secure,
         sameSite,
      }))
   }

   public async addCookies(cookies: SessionCookie[]) {
      await this.context.addCookies(
         cookies.map(cookie => ({
            ...cookie,
            expires: cookie.expires ?? -1,
         }))
      )
   }

   public async goto(url: string, waitForSelector?: string) {
      const response = await this.page.goto(url, { waitUntil: 'domcontentloaded' })

      // A block or a rate limit from the site is respected, never worked around.
      if (response && response.status() >= 400) {
         throw new Error(`The site answered ${response.status()}`)
      }

      if (waitForSelector) {
         await this.page.waitForSelector(waitForSelector)
      }

      return this.page.url()
   }

   public async click(selector: string, waitForSelector?: string) {
      await this.page.click(selector)
      await this.page.waitForLoadState('domcontentloaded')

      if (waitForSelector) {
         await this.page.waitForSelector(waitForSelector)
      }

      return this.page.url()
   }

   // A submit is answered on the same page and LinkedIn moves on a moment later; this waits for the network to go quiet
   // (not for ever: the page may keep polling) and says where the browser ended up.
   public async settled() {
      await this.page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined)

      return this.page.url()
   }

   public async extract(selectors: Record<string, string>, limit: number): Promise<ExtractedRecord[]> {
      const { wrapper, ...fields } = selectors

      return this.page.$$eval(
         wrapper,
         (elements, { entries, max }) =>
            elements
               .slice(0, max)
               .map(element =>
                  Object.fromEntries(
                     entries.map(([key, selector]) => [
                        key,
                        element.querySelector(selector)?.textContent?.trim() ?? null,
                     ])
                  )
               ),
         {
            entries: Object.entries(fields),
            max: limit,
         }
      )
   }

   // Clicked first and then typed key by key, as a person would: the click puts the focus in the field even where the
   // page ignores a script's focus (the typing then went to the field before it), and the page sees the usual key events.
   // What the field holds is read back: a page still loading can rebuild the field while it is typed into and keep only the
   // start (an e-mail cut after 9 letters was sent on staging). Then it is emptied and typed again, and never sent as it is.
   public async fill(selector: string, value: string) {
      const field = this.page.locator(selector)

      for (let attempt = 1; attempt <= FILL_ATTEMPTS; attempt += 1) {
         await field.click()
         await field.pressSequentially(value, { delay: 50 })

         if ((await field.inputValue()) === value) {
            return
         }

         await field.fill('')
      }

      throw new Error('The field did not keep what was typed')
   }

   public async type(selector: string, value: string) {
      const field = this.page.locator(selector)

      await field.click()
      await field.pressSequentially(value, { delay: 120 })
   }

   // The key goes to whatever has the focus, as when a person presses Enter after typing a password.
   public async press(key: string) {
      await this.page.keyboard.press(key)
      await this.page.waitForLoadState('domcontentloaded').catch(() => undefined)

      return this.page.url()
   }

   public async exists(selector: string, timeoutMs: number) {
      try {
         await this.page.waitForSelector(selector, {
            state: 'attached',
            timeout: timeoutMs,
         })

         return true
      } catch {
         return false
      }
   }

   // Closing releases the browser's memory; the worker takes its next task only after this. The video file is
   // complete only once the context is closed, and the recorder's pending captures need the page to be there. A context
   // that does not close in time is left to the browser's close, so a run always ends.
   public async close() {
      let timer: NodeJS.Timeout | undefined

      try {
         await this.recorder?.settle()
         await Promise.race([
            this.context.close(),
            new Promise<void>(resolve => {
               timer = setTimeout(resolve, this.closeTimeoutMs)
            }),
         ])
      } finally {
         clearTimeout(timer)
         await this.browser.close()
      }
   }
}

// Starts Camoufox, a Firefox that reports a device identity of its own (LinkedIn authorized this for the project,
// see .plan/linkedin-account-linking.md). Human-like cursor movement is on. With a proxy, timezone, locale,
// geolocation and the WebRTC address follow the proxy's exit address.
export class CamoufoxDriver implements BrowserDriver, LoginDriver, DetectionDriver {
   public constructor(private readonly options: CamoufoxOptions) {}

   public async open({ proxy, recorder, identity, storageState, exitIp }: OpenOptions = {}): Promise<DetectionSession> {
      const browser = await this.launch(proxy, recorder, identity, exitIp)

      try {
         // A proxy may re-sign secure websites with its own certificate, even an expired one. The owner accepts that
         // (.plan/proxy-accept-resigned-https.md), so the browser trusts whatever the proxy presents.
         const context = await browser.newContext({
            ...(proxy && { ignoreHTTPSErrors: true }),
            ...(storageState && { storageState }),
            ...(recorder?.videoDir && {
               recordVideo: {
                  dir: recorder.videoDir,
                  ...(recorder.videoSize && { size: recorder.videoSize }),
               },
            }),
         })

         context.setDefaultTimeout(this.options.actionTimeoutMs)
         context.setDefaultNavigationTimeout(this.options.actionTimeoutMs)

         await context.route('**/*', allowedRoute(this.options.isAllowedNavigation))

         const page = await context.newPage()

         if (recorder) {
            attachRecorder(page, recorder)
         }

         return new CamoufoxSession(browser, context, page, recorder, this.options.closeTimeoutMs)
      } catch (error) {
         await browser.close()

         throw error
      }
   }

   private async launch(
      proxy: OpenOptions['proxy'],
      recorder: OpenOptions['recorder'],
      identity: OpenOptions['identity'],
      exitIp: OpenOptions['exitIp']
   ) {
      try {
         return await Camoufox(
            buildCamoufoxOptions(
               this.options.headless ?? true,
               proxy,
               identity?.fingerprint ?? newFingerprint(this.options.operatingSystems),
               identity,
               exitIp
            )
         )
      } catch (error) {
         recorder?.log(
            'engine',
            'error',
            `Start failed: ${maskText(error instanceof Error ? error.message : 'unknown')}`
         )

         // The proxy never falls back to a direct connection. Its address and credentials stay out of the message.
         if (proxy) {
            throw new TaskError('The browser could not start through the proxy')
         }

         throw error
      }
   }
}
