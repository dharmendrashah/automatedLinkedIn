import { describe, expect, it } from 'vitest'

import { type ReplayPage, parseTimeline, replaySteps } from './replay'

const timeline = (steps: unknown[]) =>
   JSON.stringify({
      kind: 'linkedin-post',
      steps,
   })

describe('parseTimeline', () => {
   it('keeps the steps a person could repeat and leaves the observations out', () => {
      const steps = parseTimeline(
         timeline([
            {
               n: 1,
               call: 'goto',
               target: 'https://www.linkedin.com/feed/',
               ok: true,
            },
            {
               n: 2,
               call: 'exists',
               selector: '.x',
               found: true,
               ok: true,
            },
            {
               n: 3,
               call: 'cookies',
               ok: true,
            },
            {
               n: 4,
               call: 'click',
               selector: 'button.start',
               ok: false,
               error: 'not found',
            },
            {
               n: 5,
               call: 'scroll',
               pixels: 400,
               ok: true,
            },
            {
               n: 6,
               call: 'press',
               selector: 'Escape',
               ok: true,
            },
            {
               n: 7,
               call: 'fill',
               selector: 'textarea',
               length: 12,
               ok: true,
            },
         ])
      )

      expect(steps.map(step => step.n)).toEqual([1, 4, 5, 6, 7])
   })

   it('fails on a file that is not a timeline', () => {
      expect(() => parseTimeline('{"kind":"x"}')).toThrow(/timeline/)
      expect(() => parseTimeline('nope')).toThrow(/timeline/)
   })
})

const fakePage = (failOn?: string, lands: Record<string, string> = {}) => {
   const calls: string[] = []
   let at = 'https://www.linkedin.com/feed/'
   const run = async (call: string) => {
      calls.push(call)
      at = lands[call] ?? at

      if (failOn && call.startsWith(failOn)) {
         throw new Error('Timeout 15000ms exceeded.\nwaiting for locator')
      }
   }
   const page: ReplayPage = {
      goto: url => run(`goto ${url}`),
      click: selector => run(`click ${selector}`),
      fill: (selector, value) => run(`fill ${selector} ${value}`),
      press: key => run(`press ${key}`),
      scroll: pixels => run(`scroll ${pixels}`),
      url: () => at,
   }

   return {
      page,
      calls,
   }
}

const steps = parseTimeline(
   timeline([
      {
         n: 1,
         call: 'goto',
         target: 'https://www.linkedin.com/feed/',
         ok: true,
      },
      {
         n: 2,
         call: 'click',
         selector: 'button.start',
         ok: true,
      },
      {
         n: 3,
         call: 'fill',
         selector: 'textarea',
         length: 5,
         ok: true,
      },
      {
         n: 4,
         call: 'scroll',
         pixels: 300,
         ok: true,
      },
   ])
)

describe('replaySteps', () => {
   it('repeats every step in order and asks for the text that was typed', async () => {
      const { page, calls } = fakePage()
      const asked: string[] = []

      const outcome = await replaySteps({
         steps,
         page,
         ask: async question => {
            asked.push(question)

            return 'hello'
         },
         log: () => undefined,
         pause: async () => undefined,
      })

      expect(calls).toEqual([
         'goto https://www.linkedin.com/feed/',
         'click button.start',
         'fill textarea hello',
         'scroll 300',
      ])
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatch(/5 characters/)
      expect(outcome).toEqual({ done: 4 })
   })

   it('stops at the first step the page no longer has and says which', async () => {
      const { page, calls } = fakePage('click')
      const lines: string[] = []

      const outcome = await replaySteps({
         steps,
         page,
         ask: async () => 'hello',
         log: line => lines.push(line),
         pause: async () => undefined,
      })

      expect(calls).toEqual(['goto https://www.linkedin.com/feed/', 'click button.start'])
      expect(outcome).toEqual({
         done: 1,
         stoppedAt: 2,
      })
      expect(lines.join('\n')).toMatch(/Stopped at step 2/)
      expect(lines.join('\n')).not.toMatch(/waiting for locator/)
   })

   it('stops when a step lands on the sign-in page, instead of clicking its form', async () => {
      const lands = { 'goto https://www.linkedin.com/feed/': 'https://www.linkedin.com/uas/login' }
      const { page, calls } = fakePage(undefined, lands)
      const lines: string[] = []

      const outcome = await replaySteps({
         steps,
         page,
         ask: async () => 'hello',
         log: line => lines.push(line),
         pause: async () => undefined,
      })

      expect(calls).toEqual(['goto https://www.linkedin.com/feed/'])
      expect(outcome).toEqual({
         done: 0,
         stoppedAt: 1,
      })
      expect(lines.join('\n')).toMatch(/sign-in page/)
   })
})
