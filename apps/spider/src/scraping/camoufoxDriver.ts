import { Camoufox } from 'camoufox'
import { FingerprintGenerator } from 'fingerprint-generator'

import { type BrowserContext, type Page, type Response, type Route } from 'playwright-core'

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
   type PageInspection,
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
   // Who enforces `isAllowedNavigation`. route (default): every request is intercepted, which turns the browser's HTTP cache off.
   // browser: the browser itself refuses (see websiteFilter.ts), nothing is intercepted and the cache works; the caller must have
   // installed the filter. none: nothing is blocked, for the local tool, which allows every address.
   blocking?: 'route' | 'browser' | 'none'
   // Starts this browser instead of the installed one. Tests that change the browser's own policies use a copy.
   executablePath?: string
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

// What the run asks of its browser context, for a new context and for a profile launch alike. A proxy may re-sign secure
// websites with its own certificate, even an expired one. The owner accepts that (.plan/proxy-accept-resigned-https.md),
// so the browser trusts whatever the proxy presents.
const contextOptions = (proxy: OpenOptions['proxy'], recorder: OpenOptions['recorder']) => ({
   ...(proxy && { ignoreHTTPSErrors: true }),
   ...(recorder?.videoDir && {
      recordVideo: {
         dir: recorder.videoDir,
         ...(recorder.videoSize && { size: recorder.videoSize }),
      },
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

// A wheel scrolls smoothly: how long to wait before reading where the page ended up, and how often to look until it rests.
const SCROLL_SETTLE_MS = 120
const SCROLL_POLL_MS = 60
const SCROLL_POLLS = 8

// A hand rests on a link for a moment before it clicks, and a page that does not answer a click in time is not followed.
const HOVER_MIN_MS = 150
const HOVER_RANGE_MS = 300
const LINK_NAVIGATION_MS = 15_000

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// A feed holds hundreds of links; these caps keep an inspection small enough to save with the run.
const INSPECT_LIMITS = {
   maxLinks: 600,
   maxControls: 300,
   maxBlocks: 40,
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
   // Where the pointer rests: it is put over the page before the first scroll or click (see scrollBy).
   private pointer: { x: number; y: number } | undefined

   public constructor(
      // Ends the browser once its context is closed (or did not close in time).
      private readonly closeBrowser: () => Promise<void>,
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

   // Every link and control that has a box, with where it is, whether something covers it and what surrounds it. With `block`,
   // also what each element of that selector carries and holds. Read-only.
   public inspect(options: { block?: string } = {}): Promise<PageInspection> {
      return this.page.evaluate(
         ({ maxLinks, maxControls, maxBlocks, block }) => {
            const cut = (value: string | null | undefined, max = 80) =>
               (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
            const view = {
               width: window.innerWidth,
               height: window.innerHeight,
            }
            const describe = (element: Element) => {
               const role = element.getAttribute('role')
               const data = Array.from(element.attributes)
                  .filter(({ name }) => name.startsWith('data-'))
                  .slice(0, 3)
                  .map(({ name, value }) => `[${name}=${cut(value, 60)}]`)

               return `${element.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${data.join('')}`
            }
            const read = (element: Element) => {
               const rect = element.getBoundingClientRect()

               if (rect.width === 0 || rect.height === 0) {
                  return undefined
               }

               const inView = rect.left >= 0 && rect.top >= 0 && rect.right <= view.width && rect.bottom <= view.height
               const top = inView
                  ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
                  : null
               const path: string[] = []

               for (let parent = element.parentElement; parent && path.length < 8; parent = parent.parentElement) {
                  path.push(describe(parent))
               }

               return {
                  tag: element.tagName.toLowerCase(),
                  ...(element instanceof HTMLAnchorElement && { href: element.href }),
                  text: cut(element.textContent),
                  label: cut(element.getAttribute('aria-label')),
                  role: element.getAttribute('role') ?? '',
                  view: element.getAttribute('data-view-name') ?? '',
                  box: {
                     x: Math.round(rect.left),
                     y: Math.round(rect.top),
                     width: Math.round(rect.width),
                     height: Math.round(rect.height),
                  },
                  inView,
                  covered: inView && !(top && (top === element || element.contains(top))),
                  path,
               }
            }
            const collect = (selector: string, max: number) =>
               Array.from(document.querySelectorAll(selector))
                  .slice(0, max)
                  .map(read)
                  .filter(found => found !== undefined)
            const keyed = /urn:li:|\d{12,}/
            const readBlock = (element: Element) => {
               const keys = new Set<string>()
               const marks = new Set<string>()

               for (const inner of [
                  element,
                  ...Array.from(
                     element.querySelectorAll(
                        '[componentkey], [data-sdui-anchor-id], [data-view-name], [id*="urn:li:"]'
                     )
                  ),
               ]) {
                  for (const name of ['componentkey', 'data-sdui-anchor-id', 'id']) {
                     const value = inner.getAttribute(name)

                     if (value && keyed.test(value) && keys.size < 40) {
                        keys.add(cut(value, 400))
                     }
                  }

                  const mark = inner.getAttribute('data-view-name')

                  if (mark && marks.size < 60) {
                     marks.add(mark)
                  }
               }

               return {
                  keys: Array.from(keys),
                  marks: Array.from(marks),
                  links: Array.from(element.querySelectorAll('a[href]'))
                     .slice(0, 40)
                     .map(read)
                     .filter(found => found !== undefined),
               }
            }

            return {
               url: location.href,
               title: document.title,
               viewport: view,
               scrollY: Math.round(window.scrollY),
               links: collect('a[href]', maxLinks),
               controls: collect('button, [role="button"], [role="menuitem"], summary, input', maxControls),
               blocks: block ? Array.from(document.querySelectorAll(block)).slice(0, maxBlocks).map(readBlock) : [],
            }
         },
         {
            ...INSPECT_LIMITS,
            block: options.block,
         }
      )
   }

   // Where the page is scrolled to and how big the window is.
   private scrollReading() {
      return this.page.evaluate(() => ({
         y: Math.round(window.scrollY),
         more: window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 2,
         width: window.innerWidth,
         height: window.innerHeight,
      }))
   }

   // The wheel moves the page smoothly; this waits until it has come to rest.
   private async scrollRest() {
      await wait(SCROLL_SETTLE_MS)

      let reading = await this.scrollReading()

      for (let tries = 0; tries < SCROLL_POLLS; tries += 1) {
         await wait(SCROLL_POLL_MS)

         const next = await this.scrollReading()

         if (next.y === reading.y) {
            return next
         }

         reading = next
      }

      return reading
   }

   // The wheel, as a person scrolls, so the page sees real scroll events. True while there is more page below. A wheel goes to
   // whatever is under the pointer, and the pointer starts in the corner, over LinkedIn's header, which let the feed stay at the
   // top for a whole visit (recorded 2026-10-19). So the pointer rests over the middle of the page first, and a wheel that still
   // moved nothing, with room to move, is followed by a scroll made by the page itself.
   public async scrollBy(pixels: number) {
      const before = await this.scrollReading()

      if (!this.pointer) {
         await this.moveTo(before.width * (0.4 + Math.random() * 0.2), before.height * (0.45 + Math.random() * 0.25))
      }

      await this.page.mouse.wheel(0, pixels)

      const after = await this.scrollRest()
      const room = pixels > 0 ? before.more : before.y > 0

      if (after.y === before.y && room) {
         await this.page.evaluate(
            by =>
               window.scrollBy({
                  top: by,
                  behavior: 'smooth',
               }),
            pixels
         )

         return (await this.scrollRest()).more
      }

      return after.more
   }

   private async moveTo(x: number, y: number) {
      this.pointer = {
         x: Math.round(x),
         y: Math.round(y),
      }
      await this.page.mouse.move(this.pointer.x, this.pointer.y)
   }

   // A spot of an element in view where the element itself is on top and nothing matching `avoid` is under the pointer, so a
   // click there lands on the element and not on a button that sits inside it or a tray that covers it.
   private spot(find: {
      selector: string
      href?: string
      // Only the element at this place (from 0) among those that match, in page order, instead of any of them.
      nth?: number
      box?: { x: number; y: number; width: number; height: number }
      avoid: string
   }) {
      return this.page.evaluate(({ selector, href, nth, box, avoid }) => {
         const view = {
            width: window.innerWidth,
            height: window.innerHeight,
         }
         const matches = Array.from(document.querySelectorAll(selector))
            .filter(element => href === undefined || (element instanceof HTMLAnchorElement && element.href === href))
            .filter(element => {
               if (!box) {
                  return true
               }

               // The very element that was listed, found again by where it is.
               const at = element.getBoundingClientRect()

               return (
                  Math.abs(at.left - box.x) <= 8 &&
                  Math.abs(at.top - box.y) <= 8 &&
                  Math.abs(at.width - box.width) <= 8 &&
                  Math.abs(at.height - box.height) <= 8
               )
            })
         const elements = nth === undefined ? matches.sort(() => Math.random() - 0.5) : matches.slice(nth, nth + 1)

         for (const element of elements) {
            const rect = element.getBoundingClientRect()

            if (rect.width < 4 || rect.height < 4 || rect.right <= 0 || rect.bottom <= 0) {
               continue
            }

            const left = Math.max(rect.left, 0)
            const right = Math.min(rect.right, view.width)
            const top = Math.max(rect.top, 0)
            const bottom = Math.min(rect.bottom, view.height)
            const points: Array<{ x: number; y: number }> = []

            for (let row = 0; row < 4; row += 1) {
               for (let column = 0; column < 6; column += 1) {
                  points.push({
                     x: left + ((right - left) * (column + 0.5)) / 6,
                     y: top + ((bottom - top) * (row + 0.5)) / 4,
                  })
               }
            }

            for (const point of points.sort(() => Math.random() - 0.5)) {
               const on = document.elementFromPoint(point.x, point.y)

               if (on && (on === element || element.contains(on)) && !(avoid && on.closest(avoid))) {
                  return {
                     x: Math.round(point.x),
                     y: Math.round(point.y),
                  }
               }
            }
         }

         return undefined
      }, find)
   }

   // The pointer glides to the spot, rests there a moment as a hand does, then clicks.
   private async pressAt({ x, y }: { x: number; y: number }) {
      await this.moveTo(x, y)
      await wait(HOVER_MIN_MS + Math.random() * HOVER_RANGE_MS)
      await this.page.mouse.click(x, y)
   }

   public async clickLink(href: string, avoid: string) {
      const spot = await this.spot({
         selector: 'a[href]',
         href,
         avoid,
      })

      if (!spot) {
         return undefined
      }

      const before = this.page.url()

      await this.pressAt(spot)

      try {
         await this.page.waitForURL(url => url.href !== before, {
            timeout: LINK_NAVIGATION_MS,
            waitUntil: 'commit',
         })
      } catch {
         return undefined
      }

      await this.page.waitForLoadState('domcontentloaded').catch(() => undefined)

      return this.page.url()
   }

   // Clicks the link that was listed at this place, for one that answers a click in script and does not change the address (an
   // image that opens a window). True when a spot of it was found and clicked.
   public async clickInside(box: { x: number; y: number; width: number; height: number }, avoid: string) {
      const spot = await this.spot({
         selector: 'a[href]',
         box,
         avoid,
      })

      if (!spot) {
         return false
      }

      await this.pressAt(spot)

      return true
   }

   // Clicks the Nth element (from 0, in page order) of `selector`, where it is on top and nothing matching `avoid` is under the
   // pointer, for a row of a list that is not a link. False when it is not in view (the list is scrolled to it first) or there
   // is no such element.
   public async clickNth(selector: string, index: number, avoid: string) {
      const spot = await this.spot({
         selector,
         nth: index,
         avoid,
      })

      if (!spot) {
         return false
      }

      await this.pressAt(spot)

      return true
   }

   public async typeKeys(text: string) {
      const lines = text.replace(/\r\n?/g, '\n').split('\n')

      for (const [index, line] of lines.entries()) {
         if (index > 0) {
            await this.page.keyboard.press('Shift+Enter')
         }

         if (line) {
            await this.page.keyboard.type(line, { delay: 45 + Math.floor(Math.random() * 70) })
         }
      }
   }

   public async attachFiles(selector: string, paths: string[]) {
      const input = this.page.locator(selector).first()

      if ((await input.count()) === 0) {
         return false
      }

      await input.setInputFiles(paths)

      return true
   }

   // How the page's requests of one kind are answered from now on, for a task that must know whether an action was taken (LinkedIn
   // answering the send request). Only statuses are kept.
   public watchAnswers(method: string, parts: string[]) {
      const seen: number[] = []
      const listener = (response: Response) => {
         const url = response.url()

         if (response.request().method() === method && parts.every(part => url.includes(part))) {
            seen.push(response.status())
         }
      }

      this.page.on('response', listener)

      return {
         statuses: () => [...seen],
         stop: () => {
            this.page.off('response', listener)
         },
      }
   }

   public async fetchFile(url: string, maxBytes: number) {
      // A redirect is not followed: the address was chosen by the page reader, and where it leads is not known.
      const response = await this.page.context().request.get(url, {
         timeout: 60_000,
         maxRedirects: 0,
         failOnStatusCode: false,
      })

      if (!response.ok() || Number(response.headers()['content-length'] ?? 0) > maxBytes) {
         return undefined
      }

      const body = await response.body()

      return body.length > maxBytes
         ? undefined
         : {
              body,
              contentType: (response.headers()['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '',
           }
   }

   // What a wheel over a point moves: the nearest part of the page that scrolls, which is the window or a pane of its own, and how
   // far it is scrolled and whether it has room to go on in the given direction.
   private paneAt(find: { x: number; y: number; by: number }) {
      return this.page.evaluate(({ x, y, by }) => {
         let pane: Element | null = document.elementFromPoint(x, y)

         while (
            pane &&
            !(
               pane.scrollHeight > pane.clientHeight + 1 &&
               /(auto|scroll|overlay)/.test(getComputedStyle(pane).overflowY)
            )
         ) {
            pane = pane.parentElement
         }

         const top = pane ? pane.scrollTop : window.scrollY
         const room = pane
            ? by > 0
               ? pane.scrollTop + pane.clientHeight < pane.scrollHeight - 2
               : pane.scrollTop > 0
            : by > 0
              ? window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 2
              : window.scrollY > 0

         return {
            top: Math.round(top),
            room,
         }
      }, find)
   }

   // The wheel over the first element of `selector` that shows, so it is the pane that holds that element which scrolls, not the
   // page in general (a list and the conversation beside it scroll on their own). Says whether the pane moved.
   public async scrollOver(selector: string, pixels: number) {
      const point = await this.page.evaluate(sel => {
         for (const element of document.querySelectorAll(sel)) {
            const rect = element.getBoundingClientRect()
            const left = Math.max(rect.left, 0)
            const right = Math.min(rect.right, window.innerWidth)
            const top = Math.max(rect.top, 0)
            const bottom = Math.min(rect.bottom, window.innerHeight)

            if (right - left < 4 || bottom - top < 4) {
               continue
            }

            const x = left + (right - left) * (0.3 + Math.random() * 0.4)
            const y = top + (bottom - top) * (0.3 + Math.random() * 0.4)
            const on = document.elementFromPoint(x, y)

            if (on && (on === element || element.contains(on) || on.contains(element))) {
               return {
                  x: Math.round(x),
                  y: Math.round(y),
               }
            }
         }

         return undefined
      }, selector)

      if (!point) {
         return false
      }

      const before = await this.paneAt({
         ...point,
         by: pixels,
      })

      await this.moveTo(point.x, point.y)
      await this.page.mouse.wheel(0, pixels)
      await wait(SCROLL_SETTLE_MS)

      let after = await this.paneAt({
         ...point,
         by: pixels,
      })

      for (let tries = 0; tries < SCROLL_POLLS; tries += 1) {
         await wait(SCROLL_POLL_MS)

         const next = await this.paneAt({
            ...point,
            by: pixels,
         })

         if (next.top === after.top) {
            break
         }

         after = next
      }

      return after.top !== before.top
   }

   public async clickSelector(selector: string) {
      const spot = await this.spot({
         selector,
         avoid: '',
      })

      if (!spot) {
         return false
      }

      await this.pressAt(spot)

      return true
   }

   public async back() {
      await this.page.goBack({ waitUntil: 'domcontentloaded' })

      return this.page.url()
   }

   public hover(x: number, y: number) {
      return this.moveTo(x, y)
   }

   // A hand is never quite still: the pointer moves a little from where it rests.
   public async drift() {
      const { width, height } = await this.scrollReading()
      const at = this.pointer ?? {
         x: width / 2,
         y: height / 2,
      }
      const near = (value: number, limit: number) =>
         Math.min(limit - 5, Math.max(5, value + (Math.random() - 0.5) * 160))

      await this.moveTo(near(at.x, width), near(at.y, height))
   }

   public storageState() {
      return this.context.storageState({ indexedDB: true }) as Promise<StorageState>
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

   public async clearCookies(name: string) {
      await this.context.clearCookies({ name })
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
         await this.closeBrowser()
      }
   }
}

// Starts Camoufox, a Firefox that reports a device identity of its own (LinkedIn authorized this for the project,
// see .plan/linkedin-account-linking.md). Human-like cursor movement is on. With a proxy, timezone, locale,
// geolocation and the WebRTC address follow the proxy's exit address.
export class CamoufoxDriver implements BrowserDriver, LoginDriver, DetectionDriver {
   public constructor(private readonly options: CamoufoxOptions) {}

   public async open(options: OpenOptions = {}): Promise<DetectionSession> {
      return options.profileDir ? this.openProfile(options, options.profileDir) : this.openFresh(options)
   }

   private async openFresh({
      proxy,
      recorder,
      identity,
      storageState,
      exitIp,
   }: OpenOptions): Promise<DetectionSession> {
      const browser = await this.start(proxy, recorder, () => Camoufox(this.launchOptions(proxy, identity, exitIp)))

      try {
         const context = await browser.newContext({
            ...contextOptions(proxy, recorder),
            ...(storageState && { storageState }),
         })

         return new CamoufoxSession(
            () => browser.close(),
            context,
            await this.prepare(context, recorder, await context.newPage()),
            recorder,
            this.options.closeTimeoutMs
         )
      } catch (error) {
         await browser.close()

         throw error
      }
   }

   // The account's own Firefox profile: the browser and its one context are the same thing, so the run's context options go
   // into the launch. The cache is on here, as a person's browser has it (.plan/account-browser-profile.md).
   private async openProfile(
      { proxy, recorder, identity, storageState, exitIp }: OpenOptions,
      profileDir: string
   ): Promise<DetectionSession> {
      const context = await this.start(proxy, recorder, () =>
         Camoufox({
            ...this.launchOptions(proxy, identity, exitIp),
            ...contextOptions(proxy, recorder),
            persistent_context: true,
            user_data_dir: profileDir,
            enable_cache: true,
         })
      )

      try {
         if (storageState) {
            await context.setStorageState(storageState)
         }

         const page = context.pages()[0] ?? (await context.newPage())

         return new CamoufoxSession(
            async () => undefined,
            context,
            await this.prepare(context, recorder, page),
            recorder,
            this.options.closeTimeoutMs
         )
      } catch (error) {
         await context.close()

         throw error
      }
   }

   private async prepare(context: BrowserContext, recorder: OpenOptions['recorder'], page: Page) {
      context.setDefaultTimeout(this.options.actionTimeoutMs)
      context.setDefaultNavigationTimeout(this.options.actionTimeoutMs)

      if ((this.options.blocking ?? 'route') === 'route') {
         await context.route('**/*', allowedRoute(this.options.isAllowedNavigation))
      }

      if (recorder) {
         attachRecorder(page, recorder)
      }

      return page
   }

   private launchOptions(
      proxy: OpenOptions['proxy'],
      identity: OpenOptions['identity'],
      exitIp: OpenOptions['exitIp']
   ) {
      return {
         ...buildCamoufoxOptions(
            this.options.headless ?? true,
            proxy,
            identity?.fingerprint ?? newFingerprint(this.options.operatingSystems),
            identity,
            exitIp
         ),
         ...(this.options.executablePath && { executable_path: this.options.executablePath }),
      }
   }

   private async start<T>(proxy: OpenOptions['proxy'], recorder: OpenOptions['recorder'], launch: () => Promise<T>) {
      try {
         return await launch()
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
