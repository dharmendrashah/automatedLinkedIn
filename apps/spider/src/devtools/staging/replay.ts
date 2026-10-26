import { type Page } from 'playwright-core'

import { isSignedOutPage } from '../../linkedin/session'

const REPEATED = ['goto', 'click', 'fill', 'type', 'press', 'scroll']
const STEP_TIMEOUT_MS = 15_000
const SETTLE_MS = 1500

export type ReplayStep = {
   n: number
   call: string
   ok: boolean
   selector?: string
   target?: string
   pixels?: number
   length?: number
}

// The steps of a staging run's timeline.json a person could repeat. Reads (exists, extract, cookies) change nothing.
export const parseTimeline = (text: string): ReplayStep[] => {
   let timeline: { steps?: unknown }

   try {
      timeline = JSON.parse(text) as { steps?: unknown }
   } catch {
      throw new Error('That is not a timeline file.')
   }

   if (!Array.isArray(timeline.steps)) {
      throw new Error('That is not a timeline file: it has no steps.')
   }

   return (timeline.steps as ReplayStep[]).filter(step => REPEATED.includes(step.call))
}

export type ReplayPage = {
   goto: (url: string) => Promise<void>
   click: (selector: string) => Promise<void>
   fill: (selector: string, value: string) => Promise<void>
   press: (key: string) => Promise<void>
   scroll: (pixels: number) => Promise<void>
   url: () => string
}

export const playwrightReplayPage = (page: Page): ReplayPage => ({
   goto: async url => {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
   },
   click: selector => page.locator(selector).first().click({ timeout: STEP_TIMEOUT_MS }),
   fill: (selector, value) => page.locator(selector).first().fill(value, { timeout: STEP_TIMEOUT_MS }),
   press: key => page.keyboard.press(key),
   scroll: pixels => page.mouse.wheel(0, pixels),
   url: () => page.url(),
})

type ReplayOptions = {
   steps: ReplayStep[]
   page: ReplayPage
   ask: (question: string) => Promise<string>
   log: (line: string) => void
   pause?: () => Promise<void>
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, SETTLE_MS))

// Repeats the steps one after another, and stops at the first one the page cannot do. A step that failed on staging is
// tried too: repeating the failure is the point.
export const replaySteps = async ({ steps, page, ask, log, pause = settle }: ReplayOptions) => {
   let done = 0

   for (const step of steps) {
      log(
         `Step ${step.n}: ${step.call} ${step.target ?? step.selector ?? step.pixels ?? ''}${step.ok ? '' : ' (failed on staging)'}`.trim()
      )

      try {
         if (step.call === 'goto' && step.target) {
            await page.goto(step.target)
         } else if (step.call === 'click' && step.selector) {
            await page.click(step.selector)
         } else if ((step.call === 'fill' || step.call === 'type') && step.selector) {
            // Typed text is never in the timeline, only how much of it was.
            await page.fill(
               step.selector,
               await ask(`Text for step ${step.n} (${step.length ?? 0} characters on staging)`)
            )
         } else if (step.call === 'press' && step.selector) {
            await page.press(step.selector)
         } else if (step.call === 'scroll' && step.pixels !== undefined) {
            await page.scroll(step.pixels)
         }
      } catch (error) {
         const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : 'unknown'

         log(`Stopped at step ${step.n}: ${reason}`)

         return {
            done,
            stoppedAt: step.n,
         }
      }

      if (isSignedOutPage(page.url())) {
         log(`Stopped at step ${step.n}: LinkedIn showed a sign-in page, so the session is not accepted.`)

         return {
            done,
            stoppedAt: step.n,
         }
      }

      done += 1
      await pause()
   }

   return { done }
}
