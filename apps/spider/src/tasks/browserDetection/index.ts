import { z } from 'zod'

import { type TaskReport } from '@automatedLinkedIn/contracts'

import { type DetectionSession } from '../../scraping/driver'
import { type TaskContext, VisitError, defineTask } from '../defineTask'
import { DETECTION_PAGES, type DetectionPage } from './pages'
import { type DetectionOutcome, type DetectionSignal, type PageVerdict, combine } from './readers'

export const TASK_NAME = 'browser-detection'

type PageReport = {
   page: DetectionPage['page']
   url: string
   verdict: PageVerdict
   advisory: boolean
   headline: string
   signals: DetectionSignal[]
   // One sentence when the page could not be used.
   note?: string
}

const SCROLL_PX = 600
const MAX_SCROLLS = 8
const SCROLL_PAUSE_MS = 700
const READY_TIMEOUT_MS = 45_000
const HOUR_MS = 60 * 60 * 1000

const MESSAGES: Record<DetectionOutcome, string> = {
   NOT_DETECTED: 'Every detection page took this browser for a person.',
   DETECTED: 'At least one detection page took this browser for a bot.',
   COULD_NOT_TELL: 'A detection page did not answer or could not be read.',
}

const PAGE_TITLES: Record<DetectionPage['page'], string> = {
   deviceandbrowserinfo: 'Device and Browser Info',
   pixelscan: 'Pixelscan',
   'pixelscan-ip': 'Pixelscan IP check',
   'pixelscan-blacklist': 'Pixelscan IP blacklist',
}

const VERDICT_TEXT: Record<PageVerdict, { value: string; status: 'ok' | 'warn' | 'fail' }> = {
   HUMAN: {
      value: 'Looks human',
      status: 'ok',
   },
   BOT: {
      value: 'Looks like a bot',
      status: 'fail',
   },
   UNKNOWN: {
      value: 'Could not read',
      status: 'warn',
   },
}

// An advisory page never fails the test, so what it finds is a warning.
const ADVISORY_VERDICT_TEXT: typeof VERDICT_TEXT = {
   ...VERDICT_TEXT,
   HUMAN: {
      value: 'Nothing found',
      status: 'ok',
   },
   BOT: {
      value: 'Has findings',
      status: 'warn',
   },
}

// Opens one detection page, waits for its own check to finish, reads the answer, then scrolls down it while the recording
// runs and takes a picture of the whole page. A page that cannot be used is UNKNOWN with a sentence, never "human".
const visit = async (context: TaskContext, target: DetectionPage, index: number): Promise<PageReport> => {
   const report = (verdict: PageVerdict, headline: string, signals: DetectionSignal[], note?: string): PageReport => ({
      page: target.page,
      url: target.url,
      verdict,
      advisory: Boolean(target.advisory),
      headline,
      signals,
      ...(note && { note }),
   })
   const unusable = (note: string) => {
      context.warn(`${target.page}: ${note}`)

      return report('UNKNOWN', '', [], note)
   }
   const { browser } = context

   try {
      await context.visit(target.url)
   } catch (error) {
      if (error instanceof VisitError) {
         return unusable(error.message)
      }

      throw error
   }

   let result: PageReport

   if (target.start) {
      try {
         await browser.click(target.start)
      } catch {
         return unusable('The check could not be started.')
      }
   }

   if (await browser.exists(target.readySelector, READY_TIMEOUT_MS)) {
      try {
         const reading = target.read({
            text: await browser.pageText(),
            html: await browser.pageHtml(),
         })

         result = report(reading.verdict, reading.headline, reading.signals)
      } catch {
         result = unusable('The page could not be read.')
      }
   } else {
      result = unusable('The page did not finish its check in time.')
   }

   for (let scrolled = 0; scrolled < MAX_SCROLLS; scrolled += 1) {
      const more = await browser.scrollBy(SCROLL_PX)

      await context.pause(SCROLL_PAUSE_MS)

      if (!more) {
         break
      }
   }

   // The numbers start high so these never collide with the numbered steps' pictures.
   await context
      .screenshot(`9${index}-fullpage-${target.page}.png`, await browser.fullPageScreenshot())
      .catch(() => undefined)

   return result
}

const reportOf = (
   outcome: DetectionOutcome,
   pages: PageReport[],
   browser: Awaited<ReturnType<DetectionSession['identity']>> | undefined
): TaskReport => ({
   headline: pages.some(({ advisory, verdict }) => advisory && verdict === 'BOT')
      ? `${MESSAGES[outcome]} The IP pages found something worth a look.`
      : MESSAGES[outcome],
   sections: [
      ...pages.map(page => ({
         title: PAGE_TITLES[page.page],
         items: [
            {
               label: 'Verdict',
               ...(page.advisory ? ADVISORY_VERDICT_TEXT : VERDICT_TEXT)[page.verdict],
            },
            ...(page.headline
               ? [
                    {
                       label: 'The page says',
                       value: page.headline,
                    },
                 ]
               : []),
            ...(page.note
               ? [
                    {
                       label: 'Note',
                       value: page.note,
                       status: 'warn' as const,
                    },
                 ]
               : []),
            ...page.signals.slice(0, 90).map(signal => ({
               label: signal.name,
               value: signal.flagged ? 'Flagged' : 'Clear',
               status: signal.flagged ? (page.advisory ? ('warn' as const) : ('fail' as const)) : ('ok' as const),
            })),
         ],
      })),
      ...(browser
         ? [
              {
                 title: 'The browser they saw',
                 items: [
                    {
                       label: 'User agent',
                       value: browser.userAgent.slice(0, 500),
                    },
                    {
                       label: 'Platform',
                       value: browser.platform,
                    },
                    {
                       label: 'Screen',
                       value: browser.screen,
                    },
                 ],
              },
           ]
         : []),
      {
         title: 'Good to know',
         items: [
            {
               label: 'Limits',
               value: 'These pages check the browser fingerprint. A pass does not promise that LinkedIn agrees.',
            },
         ],
      },
   ],
})

// The pages are a parameter so a test can use stand-ins; the real task uses the public ones.
export const createBrowserDetection = (pages: DetectionPage[] = DETECTION_PAGES) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'Browser test',
      description:
         'Opens public bot detection pages through a proxy and checks whether they take the browser for a person.',
      input: z.strictObject({}),
      needs: {
         proxy: 'required',
         account: false,
      },
      hosts: [...new Set(pages.map(({ url }) => new URL(url).hostname))],
      verdicts: {
         NOT_DETECTED: {
            label: 'Not detected',
            tone: 'success',
         },
         DETECTED: {
            label: 'Detected as a bot',
            tone: 'failure',
         },
         COULD_NOT_TELL: {
            label: 'Could not tell',
            tone: 'neutral',
         },
      },
      policy: {
         cooldownMs: 5 * 60 * 1000,
         oneAtATime: 'proxy',
         automatic: [
            {
               on: 'proxy.active',
               everyMs: 24 * HOUR_MS,
            },
         ],
      },
      limits: { timeoutMs: 5 * 60 * 1000 },
      recording: {
         always: true,
         videoSize: {
            width: 1280,
            height: 720,
         },
      },
      run: async context => {
         const reports: PageReport[] = []

         for (const [index, target] of pages.entries()) {
            reports.push(await visit(context, target, index))
         }

         const browser = await context.browser.identity().catch(() => undefined)
         const outcome = combine(reports.filter(({ advisory }) => !advisory).map(({ verdict }) => verdict))

         return {
            status: outcome === 'NOT_DETECTED' ? 'SUCCEEDED' : 'FAILED',
            verdict: outcome,
            message: MESSAGES[outcome],
            report: reportOf(outcome, reports, browser),
         }
      },
   })

export const browserDetection = createBrowserDetection()
