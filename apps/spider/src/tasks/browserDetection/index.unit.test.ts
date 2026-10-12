import { describe, expect, it, vi } from 'vitest'

import { taskCatalogEntrySchema } from '@automatedLinkedIn/contracts'

import { catalogEntryOf } from '../catalog'
import { type TaskContext, VisitError } from '../defineTask'
import { browserDetection, createBrowserDetection } from './index'
import { type DetectionPage } from './pages'
import { type PageReading } from './readers'

const human: PageReading = {
   verdict: 'HUMAN',
   headline: 'You are human!',
   signals: [
      {
         name: 'hasWebdriverTrue',
         flagged: false,
      },
   ],
}

const bot: PageReading = {
   verdict: 'BOT',
   headline: 'Bot Behavior Detected',
   signals: [
      {
         name: 'Webdriver',
         flagged: true,
      },
   ],
}

const page = (name: DetectionPage['page'], reading: PageReading): DetectionPage => ({
   page: name,
   url: `https://${name}.example.net/check`,
   readySelector: `#${name}-done`,
   read: vi.fn(() => reading),
})

const makeContext = (overrides: Record<string, unknown> = {}) => {
   const browser = {
      exists: vi.fn(async () => true),
      scrollBy: vi.fn(async () => false),
      pageText: vi.fn(async () => 'text'),
      pageHtml: vi.fn(async () => '<html></html>'),
      fullPageScreenshot: vi.fn(async () => Buffer.from('png')),
      identity: vi.fn(async () => ({
         userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0)',
         platform: 'Win32',
         screen: '1600x900',
      })),
   }

   Object.assign(browser, overrides)

   const context = {
      browser,
      visit: vi.fn(async (url: string) => url),
      log: vi.fn(),
      warn: vi.fn(),
      screenshot: vi.fn(async (_name: string, _png: Buffer) => undefined),
      attach: vi.fn(),
      pause: vi.fn(async () => undefined),
   }

   return {
      browser,
      context,
      asContext: context as unknown as TaskContext,
   }
}

const run = (pages: DetectionPage[], made = makeContext()) => createBrowserDetection(pages).run(made.asContext, {})

describe('browser detection task', () => {
   it('should be a valid task for the catalog, that needs a proxy and no account', () => {
      const entry = catalogEntryOf(browserDetection)

      expect(taskCatalogEntrySchema.safeParse(entry).success).toBe(true)
      expect(entry).toMatchObject({
         task: 'browser-detection',
         needs: {
            proxy: 'required',
            account: false,
         },
         hosts: ['deviceandbrowserinfo.com', 'pixelscan.net'],
      })
   })

   it('should say not detected, as a success, when every page took the browser for a person', async () => {
      const outcome = await run([page('deviceandbrowserinfo', human), page('pixelscan', human)])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'NOT_DETECTED',
         message: 'Every detection page took this browser for a person.',
      })
   })

   it('should visit each page through the context, wait for its check, read it and scroll while it is recorded', async () => {
      const made = makeContext({ scrollBy: vi.fn(async () => true) })

      await run([page('deviceandbrowserinfo', human), page('pixelscan', human)], made)

      expect(made.context.visit.mock.calls.map(([url]) => url)).toEqual([
         'https://deviceandbrowserinfo.example.net/check',
         'https://pixelscan.example.net/check',
      ])
      expect(made.browser.exists).toHaveBeenCalledWith('#deviceandbrowserinfo-done', expect.any(Number))
      expect(made.browser.exists).toHaveBeenCalledWith('#pixelscan-done', expect.any(Number))
      // Scrolling goes on while there is more page, but never forever.
      expect(made.browser.scrollBy.mock.calls.length).toBeGreaterThan(2)
      expect(made.browser.scrollBy.mock.calls.length).toBeLessThanOrEqual(20)
      expect(made.context.screenshot.mock.calls.map(([name]) => name)).toEqual([
         '90-fullpage-deviceandbrowserinfo.png',
         '91-fullpage-pixelscan.png',
      ])
   })

   it('should stop scrolling when the end of the page is reached', async () => {
      const made = makeContext()

      await run([page('pixelscan', human)], made)

      expect(made.browser.scrollBy).toHaveBeenCalledTimes(1)
   })

   it('should say detected, as a failure, as soon as one page says bot, and list what was flagged', async () => {
      const outcome = await run([page('deviceandbrowserinfo', human), page('pixelscan', bot)])

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'DETECTED',
         message: 'At least one detection page took this browser for a bot.',
      })

      const pixelscan = outcome.report?.sections.find(section => section.title === 'Pixelscan')

      expect(pixelscan?.items).toEqual(
         expect.arrayContaining([
            {
               label: 'Verdict',
               value: 'Looks like a bot',
               status: 'fail',
            },
            {
               label: 'The page says',
               value: 'Bot Behavior Detected',
            },
            {
               label: 'Webdriver',
               value: 'Flagged',
               status: 'fail',
            },
         ])
      )
   })

   it('should show the browser the pages saw, and that a pass is not a promise about LinkedIn', async () => {
      const outcome = await run([page('pixelscan', human)])
      const titles = outcome.report?.sections.map(section => section.title)

      expect(titles).toEqual(['Pixelscan', 'The browser they saw', 'Good to know'])
      expect(JSON.stringify(outcome.report)).toContain('1600x900')
      expect(JSON.stringify(outcome.report)).toContain('does not promise that LinkedIn agrees')
   })

   it('should leave out the browser when it cannot say who it is', async () => {
      const made = makeContext({
         identity: vi.fn(async () => {
            throw new Error('page closed')
         }),
      })
      const outcome = await run([page('pixelscan', human)], made)

      expect(outcome.report?.sections.map(section => section.title)).toEqual(['Pixelscan', 'Good to know'])
   })

   it('should not guess when a page does not finish its check in time', async () => {
      const made = makeContext({ exists: vi.fn(async () => false) })
      const outcome = await run([page('pixelscan', human)], made)

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'COULD_NOT_TELL',
         message: 'A detection page did not answer or could not be read.',
      })
      expect(JSON.stringify(outcome.report)).toContain('did not finish its check')
   })

   it('should not guess when a reader fails, and carry on with the next page', async () => {
      const broken = page('deviceandbrowserinfo', human)

      vi.mocked(broken.read).mockImplementation(() => {
         throw new Error('unexpected markup')
      })

      const made = makeContext()
      const outcome = await run([broken, page('pixelscan', human)], made)

      expect(outcome.verdict).toBe('COULD_NOT_TELL')
      expect(made.context.visit).toHaveBeenCalledTimes(2)
   })

   it('should say what the context said when a page may not be opened, and carry on', async () => {
      const made = makeContext()

      made.context.visit.mockRejectedValueOnce(new VisitError('robots', 'The site does not allow it in robots.txt.'))

      const outcome = await run([page('deviceandbrowserinfo', human), page('pixelscan', human)], made)

      expect(outcome.verdict).toBe('COULD_NOT_TELL')
      expect(JSON.stringify(outcome.report)).toContain('robots.txt')
      expect(made.context.visit).toHaveBeenCalledTimes(2)
      expect(made.context.warn).toHaveBeenCalled()
   })

   it('should let any other failure of the browser reach the runner, which retries the task', async () => {
      const made = makeContext()

      made.context.visit.mockRejectedValue(new Error('browser crashed'))

      await expect(run([page('pixelscan', human)], made)).rejects.toThrow('browser crashed')
   })

   it('should only ever answer with a verdict it declared', async () => {
      const outcome = await run([page('pixelscan', bot)])

      expect(Object.keys(browserDetection.verdicts)).toContain(outcome.verdict)
   })
})
