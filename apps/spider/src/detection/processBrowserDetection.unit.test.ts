import { describe, expect, it, vi } from 'vitest'

import { type StandardTaskCommand, type StandardTaskResult } from '@automatedLinkedIn/contracts'

import { type Recorder } from '../recording/recorder'
import { type DetectionSession } from '../scraping/driver'
import { TaskError } from '../scraping/errors'
import { type DetectionPage } from './pages'
import { type BrowserTestDeps, processBrowserDetection } from './processBrowserDetection'
import { type PageReading } from './readers'

type Command = Extract<StandardTaskCommand, { task: 'browser_detection' }>

const command: Command = {
   task: 'browser_detection',
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a22',
   proxy: {
      server: 'http://proxy.example.net:8080',
      username: 'alice',
      password: 'hunter2-proxy-password',
   },
   requested_at: '2026-10-12T10:00:00.000Z',
}

const PREFIX = 'recordings/browser-test/0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a22/20261012T100000Z'

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

const makeSession = (overrides: Partial<Record<keyof DetectionSession, unknown>> = {}) => {
   const events: string[] = []
   const session = {
      goto: vi.fn(async (url: string) => {
         events.push(`goto ${url}`)

         return url
      }),
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
      close: vi.fn(async () => {
         events.push('closed')
      }),
   }

   Object.assign(session, overrides)

   return {
      events,
      session,
   }
}

const makeRecorder = (events: string[]) =>
   ({
      addSecret: vi.fn(),
      log: vi.fn(),
      addStep: vi.fn(() => ({ n: 1 })),
      saveScreenshot: vi.fn(async () => true),
      saveFailureHtml: vi.fn(),
      finish: vi.fn(async () => {
         events.push('recording finished')

         return PREFIX
      }),
   }) as unknown as Recorder & {
      finish: ReturnType<typeof vi.fn>
      saveScreenshot: ReturnType<typeof vi.fn>
      log: ReturnType<typeof vi.fn>
   }

const setup = (
   options: {
      pages?: DetectionPage[]
      session?: ReturnType<typeof makeSession>
      overrides?: Partial<BrowserTestDeps>
   } = {}
) => {
   const made = options.session ?? makeSession()
   const recorder = makeRecorder(made.events)
   const published: StandardTaskResult[] = []
   const deps: BrowserTestDeps = {
      driver: { open: vi.fn(async () => made.session as unknown as DetectionSession) },
      pages: options.pages ?? [page('deviceandbrowserinfo', human), page('pixelscan', human)],
      startRecording: vi.fn(async () => recorder),
      publishResult: vi.fn(async result => {
         made.events.push('published')
         published.push(result)
      }),
      robots: { check: vi.fn(async () => ({ allowed: true })) },
      limiter: { wait: vi.fn(async () => undefined) },
      policy: { allowsUrl: vi.fn(() => true) },
      pause: vi.fn(async () => undefined),
      now: () => Date.parse('2026-10-12T10:01:00.000Z'),
      ...options.overrides,
   }

   return {
      ...made,
      recorder,
      published,
      deps,
      run: () => processBrowserDetection(command, deps),
   }
}

describe('processBrowserDetection', () => {
   it('should report not detected when every page took the browser for a person, and point to the recording', async () => {
      const { run, published } = setup()

      await run()

      expect(published).toEqual([
         {
            task: 'browser_detection',
            task_id: command.task_id,
            outcome: 'NOT_DETECTED',
            message: 'Every detection page took this browser for a person.',
            recording_prefix: PREFIX,
            finished_at: '2026-10-12T10:01:00.000Z',
         },
      ])
   })

   it('should open the browser through the proxy and record it', async () => {
      const { run, deps } = setup()

      await run()

      expect(deps.driver.open).toHaveBeenCalledWith(
         expect.objectContaining({
            proxy: command.proxy,
            recorder: expect.anything(),
         })
      )
   })

   it('should visit each page, wait for its check to finish, read it and scroll down while it is recorded', async () => {
      const made = makeSession({ scrollBy: vi.fn(async () => true) })
      const { run, session, recorder } = setup({ session: made })

      await run()

      expect(session.goto.mock.calls.map(([url]) => url)).toEqual([
         'https://deviceandbrowserinfo.example.net/check',
         'https://pixelscan.example.net/check',
      ])
      expect(session.exists).toHaveBeenCalledWith('#deviceandbrowserinfo-done', expect.any(Number))
      expect(session.exists).toHaveBeenCalledWith('#pixelscan-done', expect.any(Number))
      // Scrolling goes on while there is more page, but never forever.
      expect(session.scrollBy.mock.calls.length).toBeGreaterThan(2)
      expect(session.scrollBy.mock.calls.length).toBeLessThanOrEqual(20)
      expect(session.fullPageScreenshot).toHaveBeenCalledTimes(2)
      expect(recorder.saveScreenshot.mock.calls.map(([name]) => name)).toEqual([
         expect.stringMatching(/^\d{2}-fullpage-deviceandbrowserinfo\.png$/),
         expect.stringMatching(/^\d{2}-fullpage-pixelscan\.png$/),
      ])
   })

   it('should stop scrolling when the end of the page is reached', async () => {
      const { run, session } = setup({ pages: [page('pixelscan', human)] })

      await run()

      expect(session.scrollBy).toHaveBeenCalledTimes(1)
   })

   it('should say detected as soon as one page says bot, and list what was flagged in detection.json', async () => {
      const { run, published, recorder } = setup({
         pages: [page('deviceandbrowserinfo', human), page('pixelscan', bot)],
      })

      await run()

      expect(published[0]).toMatchObject({
         outcome: 'DETECTED',
         message: 'At least one detection page took this browser for a bot.',
      })

      const [[{ failed, verdict, files }]] = recorder.finish.mock.calls

      expect(failed).toBe(true)
      expect(verdict).toBe('DETECTED')
      expect(files['detection.json']).toMatchObject({
         task_id: command.task_id,
         outcome: 'DETECTED',
         through_proxy: true,
         browser: {
            platform: 'Win32',
            screen: '1600x900',
         },
         pages: [
            expect.objectContaining({
               page: 'deviceandbrowserinfo',
               verdict: 'HUMAN',
            }),
            expect.objectContaining({
               page: 'pixelscan',
               verdict: 'BOT',
               headline: 'Bot Behavior Detected',
               signals: [
                  {
                     name: 'Webdriver',
                     flagged: true,
                  },
               ],
            }),
         ],
      })
      expect(JSON.stringify(files['detection.json'])).not.toContain('hunter2-proxy-password')
   })

   it('should close the browser before the recording is finished, so the video is complete', async () => {
      const { run, events } = setup()

      await run()

      expect(events.indexOf('closed')).toBeGreaterThan(-1)
      expect(events.indexOf('closed')).toBeLessThan(events.indexOf('recording finished'))
      expect(events.indexOf('recording finished')).toBeLessThan(events.indexOf('published'))
   })

   it('should not guess when a page does not finish its check in time', async () => {
      const made = makeSession({ exists: vi.fn(async () => false) })
      const { run, published, recorder } = setup({ session: made })

      await run()

      expect(published[0]).toMatchObject({
         outcome: 'COULD_NOT_TELL',
         message: 'A detection page did not answer or could not be read.',
      })
      expect(JSON.stringify(recorder.finish.mock.calls[0][0].files['detection.json'])).toContain(
         'did not finish its check'
      )
   })

   it('should not guess when a reader fails, and carry on with the next page', async () => {
      const broken = page('deviceandbrowserinfo', human)

      vi.mocked(broken.read).mockImplementation(() => {
         throw new Error('unexpected markup')
      })

      const { run, published, session } = setup({ pages: [broken, page('pixelscan', human)] })

      await run()

      expect(published[0].outcome).toBe('COULD_NOT_TELL')
      expect(session.goto).toHaveBeenCalledTimes(2)
   })

   it('should not visit a page that the allowlist or robots.txt refuses', async () => {
      const { run, session, published } = setup({
         overrides: {
            policy: { allowsUrl: vi.fn((url: string) => !url.includes('pixelscan')) },
            robots: { check: vi.fn(async (url: URL) => ({ allowed: !url.href.includes('deviceandbrowserinfo') })) },
         },
      })

      await run()

      expect(session.goto).not.toHaveBeenCalled()
      expect(published[0].outcome).toBe('COULD_NOT_TELL')
   })

   it('should wait for the rate limit of each host before it opens a page', async () => {
      const { run, deps } = setup()

      await run()

      expect(deps.limiter.wait).toHaveBeenCalledWith('deviceandbrowserinfo.example.net')
      expect(deps.limiter.wait).toHaveBeenCalledWith('pixelscan.example.net')
   })

   it('should answer could not tell, without retrying, when the browser cannot start through the proxy', async () => {
      const { run, published, recorder, deps } = setup()

      vi.mocked(deps.driver.open).mockRejectedValueOnce(new TaskError('The browser could not start through the proxy'))

      await run()

      expect(published[0]).toMatchObject({
         outcome: 'COULD_NOT_TELL',
         message: 'The browser could not start through the proxy.',
      })
      expect(recorder.finish).toHaveBeenCalledWith(expect.objectContaining({ failed: true }))
   })

   it('should let the broker retry when the browser fails for another reason, and still close the recording', async () => {
      const { run, published, recorder, deps } = setup()

      vi.mocked(deps.driver.open).mockRejectedValueOnce(new Error('out of memory'))

      await expect(run()).rejects.toThrow('out of memory')

      expect(published).toEqual([])
      expect(recorder.finish).toHaveBeenCalledWith(
         expect.objectContaining({
            failed: true,
            verdict: 'CRASHED',
         })
      )
   })

   it('should still run when the recording cannot start, and report no recording', async () => {
      const { run, published } = setup({
         overrides: { startRecording: vi.fn(async () => Promise.reject(new Error('disk full'))) },
      })

      await run()

      expect(published[0].outcome).toBe('NOT_DETECTED')
      expect(published[0].recording_prefix).toBeUndefined()
   })

   it('should run without a proxy when the command has none', async () => {
      const { deps } = setup()

      await processBrowserDetection(
         {
            ...command,
            proxy: undefined,
         },
         deps
      )

      expect(vi.mocked(deps.driver.open).mock.calls[0][0]).not.toHaveProperty('proxy')
   })
})
