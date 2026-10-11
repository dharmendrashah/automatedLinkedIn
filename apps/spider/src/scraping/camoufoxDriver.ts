import { Camoufox } from 'camoufox'

import { type Browser, type BrowserContext, type Page } from 'playwright-core'

import { type ExtractedRecord, type SessionCookie } from '../types'

import { type BrowserDriver, type LoginDriver, type LoginSession, type OpenOptions } from './driver'
import { TaskError } from './errors'

export type CamoufoxOptions = {
   actionTimeoutMs: number
   // Page loads to anything else are blocked in the browser, not only checked afterwards.
   isAllowedNavigation: (url: string) => boolean
}

class CamoufoxSession implements LoginSession {
   public constructor(
      private readonly browser: Browser,
      private readonly context: BrowserContext,
      private readonly page: Page
   ) {}

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

   // Closing releases the browser's memory; the worker takes its next task only after this.
   public async close() {
      try {
         await this.context.close()
      } finally {
         await this.browser.close()
      }
   }
}

// Starts Camoufox, a Firefox that reports a device identity of its own (LinkedIn authorized this for the project,
// see .plan/linkedin-account-linking.md). Human-like cursor movement is on. With a proxy, timezone, locale,
// geolocation and the WebRTC address follow the proxy's exit address.
export class CamoufoxDriver implements BrowserDriver, LoginDriver {
   public constructor(private readonly options: CamoufoxOptions) {}

   public async open({ proxy }: OpenOptions = {}): Promise<LoginSession> {
      const browser = await this.launch(proxy)

      try {
         const context = await browser.newContext()

         context.setDefaultTimeout(this.options.actionTimeoutMs)
         context.setDefaultNavigationTimeout(this.options.actionTimeoutMs)

         await context.route('**/*', route =>
            route.request().isNavigationRequest() && !this.options.isAllowedNavigation(route.request().url())
               ? route.abort('blockedbyclient')
               : route.continue()
         )

         return new CamoufoxSession(browser, context, await context.newPage())
      } catch (error) {
         await browser.close()

         throw error
      }
   }

   private async launch(proxy: OpenOptions['proxy']) {
      try {
         return await Camoufox({
            headless: true,
            humanize: true,
            ...(proxy && {
               proxy,
               geoip: true,
            }),
         })
      } catch (error) {
         // The proxy never falls back to a direct connection. Its address and credentials stay out of the message.
         if (proxy) {
            throw new TaskError('The browser could not start through the proxy')
         }

         throw error
      }
   }
}
