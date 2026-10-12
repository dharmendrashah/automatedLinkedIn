import { type ExtractedRecord, type SessionCookie } from '../types'

import { type LoginSession } from '../scraping/driver'
import { maskText, maskUrl } from './masking'
import { type Recorder, type StepCall, type StepEntry } from './recorder'

type StepRecorder = Pick<Recorder, 'addStep' | 'log' | 'addSecret' | 'saveScreenshot' | 'saveFailureHtml'>

type Details = Partial<
   Pick<StepEntry, 'selector' | 'target' | 'urlBefore' | 'urlAfter' | 'length' | 'found' | 'count' | 'pixels'>
>

// Wraps a browser session and notes every call it gets: what it was, how long it took, how it ended, and a
// screenshot of the page after it. It changes nothing about the call. What was typed is never noted, only how much.
export class RecordedSession implements LoginSession {
   private lastUrl: string | undefined

   public constructor(
      protected readonly inner: LoginSession,
      protected readonly recorder: StepRecorder
   ) {}

   public async goto(url: string, waitForSelector?: string) {
      return this.step(
         'goto',
         { target: maskUrl(url) },
         async () => {
            const landed = await this.inner.goto(url, waitForSelector)

            this.lastUrl = landed

            return landed
         },
         landed => ({ urlAfter: maskUrl(landed) })
      )
   }

   public async click(selector: string, waitForSelector?: string) {
      return this.step(
         'click',
         { selector },
         async () => {
            const landed = await this.inner.click(selector, waitForSelector)

            this.lastUrl = landed

            return landed
         },
         landed => ({ urlAfter: maskUrl(landed) })
      )
   }

   public async fill(selector: string, value: string) {
      // The text may be a password or a code; any place it shows up later is blanked.
      this.recorder.addSecret(value)

      return this.step(
         'fill',
         {
            selector,
            length: value.length,
         },
         () => this.inner.fill(selector, value)
      )
   }

   public async exists(selector: string, timeoutMs: number) {
      return this.step(
         'exists',
         { selector },
         () => this.inner.exists(selector, timeoutMs),
         found => ({ found })
      )
   }

   public async extract(selectors: Record<string, string>, limit: number): Promise<ExtractedRecord[]> {
      return this.step(
         'extract',
         { selector: selectors.wrapper },
         () => this.inner.extract(selectors, limit),
         records => ({ count: records.length })
      )
   }

   public async addCookies(cookies: SessionCookie[]) {
      return this.step('addCookies', {}, () => this.inner.addCookies(cookies), undefined, false)
   }

   public async cookies() {
      return this.step('cookies', {}, () => this.inner.cookies(), undefined, false)
   }

   public async close() {
      await this.inner.close()
   }

   protected async step<T>(
      call: StepCall,
      base: Details,
      run: () => Promise<T>,
      details?: (result: T) => Details,
      screenshots = true
   ): Promise<T> {
      const started = performance.now()
      const urlBefore = this.lastUrl ? maskUrl(this.lastUrl) : undefined
      const took = () => Math.round(performance.now() - started)

      try {
         const result = await run()
         const info = {
            ...base,
            ...details?.(result),
         }
         const entry = this.recorder.addStep({
            call,
            durationMs: took(),
            ok: true,
            ...(urlBefore && { urlBefore }),
            ...info,
         })

         this.recorder.log('spider', 'info', `${call} ${info.urlAfter ?? info.selector ?? info.target ?? ''}`.trim())

         if (screenshots) {
            entry.screenshot = await this.snapshot(entry.n, call)
         }

         return result
      } catch (error) {
         const message = maskText(error instanceof Error ? error.message : String(error))
         const entry = this.recorder.addStep({
            call,
            durationMs: took(),
            ok: false,
            error: message,
            ...(urlBefore && { urlBefore }),
            ...base,
         })

         this.recorder.log('spider', 'error', `${call} failed: ${message}`)

         if (screenshots) {
            entry.screenshot = await this.snapshot(entry.n, `${call}-failed`)
            await this.keepPage()
         }

         throw error
      }
   }

   // A recording must never change what the run does, so any problem here is dropped.
   private async snapshot(n: number, label: string) {
      if (!this.inner.screenshot) {
         return undefined
      }

      try {
         const name = `${String(n).padStart(2, '0')}-${label}.png`

         return (await this.recorder.saveScreenshot(name, await this.inner.screenshot())) ? name : undefined
      } catch {
         return undefined
      }
   }

   private async keepPage() {
      try {
         const html = await this.inner.pageHtml?.()

         if (html !== undefined) {
            this.recorder.saveFailureHtml(html)
         }
      } catch {
         // The page may already be gone.
      }
   }
}
