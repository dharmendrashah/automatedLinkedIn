import { describe, expect, it } from 'vitest'

import { parseDetection, parseLogs, parseNetwork, parseTimeline } from './recording'

const step = {
   n: 1,
   t: 20,
   call: 'goto',
   durationMs: 12,
   ok: true,
   target: 'https://www.linkedin.com/login',
   urlAfter: 'https://www.linkedin.com/login',
   screenshot: '01-goto.png',
}

const timeline = {
   kind: 'validate',
   id: 'abc',
   startedAt: '2026-10-12T10:00:00.000Z',
   durationMs: 4200,
   outcome: 'failed',
   verdict: 'ERROR',
   video: true,
   screenshots: ['01-goto.png'],
   notes: [],
   steps: [step],
}

describe('parseTimeline', () => {
   it('should read a timeline written by the spider', () => {
      expect(parseTimeline(JSON.stringify(timeline))).toMatchObject({
         outcome: 'failed',
         verdict: 'ERROR',
         video: true,
         steps: [step],
      })
   })

   it('should drop a step that is not in the expected shape, and keep the rest', () => {
      const parsed = parseTimeline(
         JSON.stringify({
            ...timeline,
            steps: [step, { n: 'two' }, { ...step, n: 3 }],
         })
      )

      expect(parsed?.steps.map(item => item.n)).toEqual([1, 3])
   })

   it.each(['', 'not json', '[]', 'null', '{"steps":"no"}'])('should say there is no timeline for %j', text => {
      expect(parseTimeline(text)).toBeNull()
   })
})

describe('parseNetwork', () => {
   const entry = {
      t: 10,
      method: 'GET',
      url: 'https://www.linkedin.com/login',
      resourceType: 'document',
      status: 200,
      durationMs: 85,
      requestHeaders: { accept: '*/*' },
      responseHeaders: { 'content-type': 'text/html' },
      body: '<html></html>',
   }

   it('should read the requests, whether they got an answer or not', () => {
      const parsed = parseNetwork(
         JSON.stringify([
            entry,
            {
               ...entry,
               status: null,
               failure: 'net::ERR_ABORTED',
               body: undefined,
            },
         ])
      )

      expect(parsed).toHaveLength(2)
      expect(parsed[1]).toMatchObject({
         status: null,
         failure: 'net::ERR_ABORTED',
      })
   })

   it('should keep what it can read, and ignore the rest', () => {
      expect(parseNetwork(JSON.stringify([entry, { nonsense: true }, 'text']))).toHaveLength(1)
   })

   it.each(['', 'not json', '{}', 'null'])('should read nothing from %j', text => {
      expect(parseNetwork(text)).toEqual([])
   })
})

describe('parseLogs', () => {
   it('should read the log lines with where each came from', () => {
      expect(
         parseLogs(
            JSON.stringify([
               {
                  t: 5,
                  source: 'browser',
                  level: 'error',
                  message: 'boom',
               },
               {
                  t: 6,
                  source: 'engine',
                  level: 'warn',
                  message: 'Request failed',
               },
            ])
         )
      ).toHaveLength(2)
   })

   it('should ignore a line from a source it does not know', () => {
      expect(
         parseLogs(
            JSON.stringify([
               {
                  t: 5,
                  source: 'mystery',
                  level: 'error',
                  message: 'x',
               },
            ])
         )
      ).toEqual([])
   })

   it('should read nothing from text that is not a list', () => {
      expect(parseLogs('oops')).toEqual([])
   })
})

describe('parseDetection', () => {
   const page = {
      page: 'pixelscan',
      url: 'https://pixelscan.net/bot-check',
      verdict: 'BOT',
      headline: 'Bot Behavior Detected',
      signals: [{ name: 'Automation framework', flagged: true }],
   }
   const report = {
      task_id: 'abc',
      outcome: 'DETECTED',
      through_proxy: true,
      note: 'These pages check the browser fingerprint.',
      browser: {
         userAgent: 'Mozilla/5.0',
         platform: 'Win32',
         screen: '1600x900',
      },
      pages: [page],
   }

   it('should read a report written by the spider', () => {
      expect(parseDetection(JSON.stringify(report))).toMatchObject({
         outcome: 'DETECTED',
         through_proxy: true,
         browser: { platform: 'Win32' },
         pages: [page],
      })
   })

   it('should drop a page that is not in the expected shape, and keep the rest', () => {
      const parsed = parseDetection(
         JSON.stringify({
            ...report,
            pages: [page, { page: 7 }, { ...page, page: 'deviceandbrowserinfo', note: 'The page did not load.' }],
         })
      )

      expect(parsed?.pages.map(item => item.page)).toEqual(['pixelscan', 'deviceandbrowserinfo'])
   })

   it('should work without the browser identity', () => {
      expect(parseDetection(JSON.stringify({ ...report, browser: undefined }))?.browser).toBeUndefined()
   })

   it.each(['', 'not json', '[]', 'null', '{"pages":"no"}'])('should say there is no report for %j', text => {
      expect(parseDetection(text)).toBeNull()
   })
})
