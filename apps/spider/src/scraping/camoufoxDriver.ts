import { Camoufox } from 'camoufox'
import { FingerprintGenerator } from 'fingerprint-generator'

import { type Browser, type BrowserContext, type Page } from 'playwright-core'

import { type ExtractedRecord, type SessionCookie } from '../types'

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
   type StorageState,
} from './driver'
import { TaskError } from './errors'

export type CamoufoxOptions = {
   actionTimeoutMs: number
   // Page loads to anything else are blocked in the browser, not only checked afterwards.
   isAllowedNavigation: (url: string) => boolean
   // `virtual` runs a real browser on an Xvfb display, which Camoufox advises over plain headless; `false` is a real
   // window, for the local devtools recorder only (apps/spider/src/devtools) — production never sets it.
   headless?: true | 'virtual' | false
   // Limits the fingerprint to these systems. Only a run on a desktop passes it (see `newFingerprint`).
   operatingSystems?: FingerprintOs[]
}

// What CamoufoxDriver passes to Camoufox(), shared with the local devtools recorder so both start the exact same
// browser identity instead of keeping two copies of these options.
export const buildCamoufoxOptions = (
   headless: Exclude<CamoufoxOptions['headless'], undefined>,
   proxy: OpenOptions['proxy'],
   fingerprint = newFingerprint()
) => ({
   headless,
   humanize: true,
   fingerprint,
   ...(proxy && {
      proxy,
      geoip: true,
   }),
})

// A page that is stuck should not hold up the screenshot of the step that failed.
const SNAPSHOT_TIMEOUT_MS = 5000

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
      private readonly recorder?: RunRecorder
   ) {}

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

   // Typed key by key, as a person would, so the page sees the usual key events.
   public async fill(selector: string, value: string) {
      await this.page.locator(selector).pressSequentially(value, { delay: 50 })
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
   // complete only once the context is closed, and the recorder's pending captures need the page to be there.
   public async close() {
      try {
         await this.recorder?.settle()
         await this.context.close()
      } finally {
         await this.browser.close()
      }
   }
}

// Starts Camoufox, a Firefox that reports a device identity of its own (LinkedIn authorized this for the project,
// see .plan/linkedin-account-linking.md). Human-like cursor movement is on. With a proxy, timezone, locale,
// geolocation and the WebRTC address follow the proxy's exit address.
export class CamoufoxDriver implements BrowserDriver, LoginDriver, DetectionDriver {
   public constructor(private readonly options: CamoufoxOptions) {}

   public async open({ proxy, recorder }: OpenOptions = {}): Promise<DetectionSession> {
      const browser = await this.launch(proxy, recorder)

      try {
         // A proxy may re-sign secure websites with its own certificate, even an expired one. The owner accepts that
         // (.plan/proxy-accept-resigned-https.md), so the browser trusts whatever the proxy presents.
         const context = await browser.newContext({
            ...(proxy && { ignoreHTTPSErrors: true }),
            ...(recorder?.videoDir && {
               recordVideo: {
                  dir: recorder.videoDir,
                  ...(recorder.videoSize && { size: recorder.videoSize }),
               },
            }),
         })

         context.setDefaultTimeout(this.options.actionTimeoutMs)
         context.setDefaultNavigationTimeout(this.options.actionTimeoutMs)

         await context.route('**/*', route =>
            route.request().isNavigationRequest() && !this.options.isAllowedNavigation(route.request().url())
               ? route.abort('blockedbyclient')
               : route.continue()
         )

         const page = await context.newPage()

         if (recorder) {
            attachRecorder(page, recorder)
         }

         return new CamoufoxSession(browser, context, page, recorder)
      } catch (error) {
         await browser.close()

         throw error
      }
   }

   private async launch(proxy: OpenOptions['proxy'], recorder: OpenOptions['recorder']) {
      try {
         return await Camoufox(
            buildCamoufoxOptions(this.options.headless ?? true, proxy, newFingerprint(this.options.operatingSystems))
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
