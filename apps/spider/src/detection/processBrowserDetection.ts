import {
   type BrowserTestOutcome,
   type StandardTaskCommand,
   type StandardTaskResult,
} from '@automatedLinkedIn/contracts'

import { RecordedDetectionSession } from '../recording/recordedDetectionSession'
import { type Recorder } from '../recording/recorder'
import { type DetectionDriver, type DetectionSession } from '../scraping/driver'
import { TaskError } from '../scraping/errors'
import { type HostPolicy } from '../scraping/policy'
import { type HostRateLimiter } from '../scraping/rateLimiter'
import { type RobotsGuard } from '../scraping/robots'
import { DETECTION_PAGES, type DetectionPage } from './pages'
import { type DetectionSignal, type PageVerdict, combine } from './readers'

type BrowserTestCommand = Extract<StandardTaskCommand, { task: 'browser_detection' }>

export type BrowserTestDeps = {
   driver: DetectionDriver
   publishResult: (result: StandardTaskResult) => Promise<void>
   // A browser test is always recorded: the recording is the point of it. Absent runs without one.
   startRecording?: (id: string) => Promise<Recorder>
   robots: Pick<RobotsGuard, 'check'>
   limiter: Pick<HostRateLimiter, 'wait'>
   policy: Pick<HostPolicy, 'allowsUrl'>
   pages?: DetectionPage[]
   pause?: (ms: number) => Promise<void>
   now?: () => number
}

type PageReport = {
   page: DetectionPage['page']
   url: string
   verdict: PageVerdict
   headline: string
   signals: DetectionSignal[]
   // One sentence when the page could not be used.
   note?: string
}

const SCROLL_PX = 600
const MAX_SCROLLS = 8
const SCROLL_PAUSE_MS = 700
const READY_TIMEOUT_MS = 45_000

const MESSAGES: Record<BrowserTestOutcome, string> = {
   NOT_DETECTED: 'Every detection page took this browser for a person.',
   DETECTED: 'At least one detection page took this browser for a bot.',
   COULD_NOT_TELL: 'A detection page did not answer or could not be read.',
}

const PROXY_MESSAGE = 'The browser could not start through the proxy.'

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Opens one detection page, waits for its own check to finish, reads the answer, then scrolls down it while the recording
// runs and takes a picture of the whole page. A page that cannot be used is UNKNOWN with a sentence, never "human".
const visit = async (
   session: DetectionSession,
   recorder: Recorder | undefined,
   target: DetectionPage,
   index: number,
   deps: BrowserTestDeps
): Promise<PageReport> => {
   const { robots, limiter, policy, pause = wait } = deps
   const report = (verdict: PageVerdict, headline: string, signals: DetectionSignal[], note?: string): PageReport => ({
      page: target.page,
      url: target.url,
      verdict,
      headline,
      signals,
      ...(note && { note }),
   })
   const unusable = (note: string) => {
      recorder?.log('spider', 'warn', `${target.page}: ${note}`)

      return report('UNKNOWN', '', [], note)
   }

   if (!policy.allowsUrl(target.url)) {
      return unusable('The address is not on the spider allowlist.')
   }

   const url = new URL(target.url)

   try {
      if (!(await robots.check(url)).allowed) {
         return unusable('The site does not allow it in robots.txt.')
      }
   } catch {
      return unusable('robots.txt could not be checked.')
   }

   await limiter.wait(url.hostname)

   try {
      await session.goto(target.url)
   } catch {
      return unusable('The page did not load.')
   }

   let result: PageReport

   if (await session.exists(target.readySelector, READY_TIMEOUT_MS)) {
      try {
         const reading = target.read({
            text: await session.pageText(),
            html: await session.pageHtml(),
         })

         result = report(reading.verdict, reading.headline, reading.signals)
      } catch {
         result = unusable('The page could not be read.')
      }
   } else {
      result = unusable('The page did not finish its check in time.')
   }

   for (let scrolled = 0; scrolled < MAX_SCROLLS; scrolled += 1) {
      const more = await session.scrollBy(SCROLL_PX)

      await pause(SCROLL_PAUSE_MS)

      if (!more) {
         break
      }
   }

   // The numbers start high so these never collide with the numbered steps' pictures.
   await recorder
      ?.saveScreenshot(`9${index}-fullpage-${target.page}.png`, await session.fullPageScreenshot())
      .catch(() => undefined)

   return result
}

// The standard task "browser detection": opens the spider's browser through a proxy, visits the public bot detection pages,
// records it, and reports whether the browser was taken for a bot. It resolves once the result is published. It rejects for
// problems the broker should retry (the browser crashing), and answers COULD_NOT_TELL when the proxy itself does not work.
export const processBrowserDetection = async (command: BrowserTestCommand, deps: BrowserTestDeps) => {
   const { driver, publishResult, pages = DETECTION_PAGES, now = Date.now } = deps
   const startedAt = now()
   const result = (outcome: BrowserTestOutcome, message: string, recording?: string): StandardTaskResult => ({
      task: 'browser_detection',
      task_id: command.task_id,
      outcome,
      message,
      ...(recording && { recording_prefix: recording }),
      finished_at: new Date(now()).toISOString(),
   })

   // A recording is the point of this task, but if it cannot start the test still runs.
   const recorder = await deps.startRecording?.(command.task_id).catch(() => undefined)

   for (const secret of [command.proxy?.username, command.proxy?.password]) {
      if (secret) {
         recorder?.addSecret(secret)
      }
   }

   recorder?.log('spider', 'info', `Browser test started${command.proxy ? ' through a proxy' : ' without a proxy'}`)

   let session: DetectionSession

   try {
      session = await driver.open({
         ...(command.proxy && { proxy: command.proxy }),
         ...(recorder && { recorder }),
      })
   } catch (error) {
      // A proxy that does not work is an answer to this test, not a reason to retry it.
      if (error instanceof TaskError) {
         const recording = await recorder?.finish({
            failed: true,
            verdict: 'COULD_NOT_TELL',
         })

         await publishResult(result('COULD_NOT_TELL', PROXY_MESSAGE, recording))

         return
      }

      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   const watched = recorder ? new RecordedDetectionSession(session, recorder) : session
   const reports: PageReport[] = []
   let browser: Awaited<ReturnType<DetectionSession['identity']>> | undefined

   try {
      for (const [index, target] of pages.entries()) {
         reports.push(await visit(watched, recorder, target, index, deps))
      }

      browser = await session.identity().catch(() => undefined)
   } catch (error) {
      await session.close().catch(() => undefined)
      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   // The video is complete only after the browser is closed.
   await session.close().catch(() => undefined)

   const outcome = combine(reports.map(({ verdict }) => verdict))

   recorder?.log('spider', outcome === 'NOT_DETECTED' ? 'info' : 'warn', `Verdict: ${outcome}`)

   const recording = await recorder?.finish({
      failed: outcome !== 'NOT_DETECTED',
      verdict: outcome,
      files: {
         'detection.json': {
            task_id: command.task_id,
            started_at: new Date(startedAt).toISOString(),
            finished_at: new Date(now()).toISOString(),
            outcome,
            through_proxy: Boolean(command.proxy),
            // The pages look at fingerprint signals only: not the IP's reputation, not behaviour, and not LinkedIn.
            note: 'These pages check the browser fingerprint. A pass does not promise that LinkedIn agrees.',
            ...(browser && { browser }),
            pages: reports,
         },
      },
   })

   await publishResult(result(outcome, MESSAGES[outcome], recording))
}
