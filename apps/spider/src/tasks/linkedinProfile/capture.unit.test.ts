import { describe, expect, it, vi } from 'vitest'

import { VisitError } from '../defineTask'
import { BUDGET_MS, DETAIL_PAGES, captureProfile } from './capture'

const BASE = 'https://www.linkedin.com'
const PROFILE = `${BASE}/in/ada-test/`

type Page = {
   // Where `/in/me/` leads.
   lands?: string
   // The detail pages (by path) that will not open.
   refuse?: string[]
   // How many scrolls of a page still move it.
   scrolls?: number
   // Milliseconds each pause adds to the clock.
   pauseMs?: number
   // How many chips besides the first the Interests page has.
   tabs?: number
   // The first click on a chip finds nothing in reach.
   missFirst?: boolean
   // How many times the list of skills loads another part when it is scrolled up and down again.
   parts?: number
   // How many items each list holds (a list of fewer than a part is complete and is not scrolled up and down).
   listItems?: number
}

const setup = ({
   lands = PROFILE,
   refuse = [],
   scrolls = 2,
   pauseMs,
   tabs = 0,
   missFirst = false,
   parts = 0,
   listItems = 0,
}: Page = {}) => {
   const opened: string[] = []
   const attached: Record<string, string> = {}
   let current = BASE
   let left = scrolls
   let time = 0
   // How far down the page is scrolled, and where it was at each click on a chip.
   let y = 0
   const positions: number[] = []
   let missed = missFirst
   let jiggled = false
   let loaded = 0
   const browser = {
      inspect: vi.fn(async () => ({
         url: current,
         scrollY: y,
      })),
      clickLink: vi.fn(async () => undefined),
      clickNth: vi.fn(async (selector: string, nth: number, _avoid: string, _bringIntoView?: boolean) => {
         positions.push(y)

         if (missed && current.endsWith('details/interests/')) {
            missed = false

            return false
         }

         if (selector !== '[role="radio"]' || !current.endsWith('details/interests/') || nth > tabs) {
            return false
         }

         left = scrolls

         return true
      }),
      back: vi.fn(async () => current),
      scrollBy: vi.fn(async (pixels: number) => {
         if (pixels < 0) {
            y = Math.max(0, y + pixels)
            jiggled = true

            return false
         }

         if (jiggled && current.endsWith('details/skills/') && loaded < parts) {
            loaded += 1
            jiggled = false
         }

         if (left > 0) {
            left -= 1
            y += 800

            return true
         }

         return false
      }),
      pageHtml: vi.fn(
         async () =>
            `<html><body>page${'+'.repeat(loaded)}<div data-testid="lazy-column">${'<hr role="presentation">'.repeat(listItems + 10 * loaded)}</div></body></html>`
      ),
      screenshot: vi.fn(async () => Buffer.from('png')),
      clearCookies: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => current),
   }
   const context = {
      browser,
      visit: vi.fn(async (url: string) => {
         opened.push(url)

         if (refuse.some(path => url.endsWith(path))) {
            throw new VisitError('load', 'The page did not open.')
         }

         current = url === `${BASE}/in/me/` ? lands : url
         left = scrolls
         y = 0

         return current
      }),
      pause: vi.fn(async (ms: number) => {
         time += pauseMs ?? ms
      }),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) => {
         attached[name] = content
      }),
      screenshot: vi.fn(async () => undefined),
   }

   return {
      browser,
      context,
      opened,
      attached,
      positions,
      capture: () =>
         captureProfile(context as never, BASE, {
            random: () => 0.5,
            now: () => time,
         }),
   }
}

describe('captureProfile', () => {
   it('should open the profile and each page behind its Show all links, and keep every one with the run', async () => {
      const { capture, opened, attached } = setup()

      await expect(capture()).resolves.toEqual({
         outcome: 'DONE',
         pages: DETAIL_PAGES.length + 1,
         missed: 0,
      })

      expect(opened).toEqual([`${BASE}/in/me/`, ...DETAIL_PAGES.map(({ path }) => `${PROFILE}${path}`)])
      expect(Object.keys(attached)).toEqual(
         expect.arrayContaining([
            'profile.html',
            'profile.inspect.json',
            'detail-experience.html',
            'detail-recommendations-given.html',
            'detail-comments.html',
         ])
      )
      // A run keeps at most 20 files, so only the profile keeps its links and controls.
      expect(Object.keys(attached).length).toBeLessThanOrEqual(20)
      expect(attached).not.toHaveProperty(['detail-experience.inspect.json'])
   })

   it('should scroll a page down until it stops moving, so what loads as it is scrolled is kept', async () => {
      const { capture, browser } = setup({ scrolls: 2 })

      await capture()

      // Two scrolls that move and two that do not, for each of the eleven pages.
      expect(browser.scrollBy).toHaveBeenCalledTimes(4 * (DETAIL_PAGES.length + 1))
   })

   it('should scroll a long list up and down until it stops growing, so the parts that load as its end comes into view are kept', async () => {
      const { capture, attached } = setup({
         parts: 2,
         listItems: 20,
      })

      await capture()

      expect(attached['detail-skills.html']).toContain('page++<')
      expect(attached['detail-education.html']).toContain('page<')
   })

   it('should stop asking a long list for more once it holds 50 items', async () => {
      const { capture, attached } = setup({
         parts: 5,
         listItems: 45,
      })

      await capture()

      // The first part brings it to 55, so no second round is made.
      expect(attached['detail-skills.html']).toContain('page+<')
   })

   it('should click nothing', async () => {
      const { capture, browser } = setup()

      await capture()

      expect(browser.clickLink).not.toHaveBeenCalled()
      expect(browser.click).not.toHaveBeenCalled()
      // The one chip is looked for twice before the walk goes on.
      expect(browser.clickNth).toHaveBeenCalledTimes(2)
   })

   it('should open each other chip of the Interests page by its label, and keep a page for each, as far as there are chips', async () => {
      const { capture, attached, browser } = setup({ tabs: 2 })

      await capture()

      expect(browser.clickNth.mock.calls.map(([selector, nth]) => [selector, nth])).toEqual([
         ['[role="radio"]', 1],
         ['[role="radio"]', 2],
         ['[role="radio"]', 3],
         ['[role="radio"]', 3],
      ])
      expect(Object.keys(attached)).toEqual(
         expect.arrayContaining(['detail-interests.html', 'detail-interests-2.html', 'detail-interests-3.html'])
      )
      expect(attached).not.toHaveProperty(['detail-interests-4.html'])
   })

   it('should click each chip with the page asked to bring it into view', async () => {
      const { capture, browser } = setup({ tabs: 2 })

      await capture()

      expect(browser.clickNth.mock.calls.every(([, , , bringIntoView]) => bringIntoView === true)).toBe(true)
   })

   it('should try a chip once more, and keep a picture of the miss, when the first click finds nothing in reach', async () => {
      const { capture, attached, context } = setup({
         tabs: 1,
         missFirst: true,
      })

      await capture()

      expect(attached).toHaveProperty(['detail-interests-2.html'])
      expect(context.screenshot).toHaveBeenCalledWith('interests-chip-1-missed', expect.any(Buffer))
      expect(context.log).toHaveBeenCalledWith('A chip of Interests was out of reach')
   })

   it('should keep at most four more pages of chips, and stay under the 20 files of a run', async () => {
      const { capture, attached } = setup({ tabs: 9 })

      await capture()

      expect(attached).toHaveProperty(['detail-interests-5.html'])
      expect(attached).not.toHaveProperty(['detail-interests-6.html'])
      expect(Object.keys(attached).length).toBeLessThanOrEqual(20)
   })

   it('should say the profile did not open when the address of the account leads somewhere else, and keep that page', async () => {
      const { capture, attached, opened } = setup({ lands: `${BASE}/feed/` })

      await expect(capture()).resolves.toEqual({
         outcome: 'NOT_OPENED',
         pages: 0,
         missed: DETAIL_PAGES.length,
      })

      expect(opened).toEqual([`${BASE}/in/me/`])
      expect(attached).toHaveProperty(['profile-not-opened.html'])
   })

   it('should say signed out when LinkedIn asks for a sign-in', async () => {
      const { capture } = setup({ lands: `${BASE}/login` })

      await expect(capture()).resolves.toMatchObject({
         outcome: 'SIGNED_OUT',
         pages: 0,
      })
   })

   it('should keep what it could and say part was kept when one page does not open', async () => {
      const { capture, attached, context } = setup({ refuse: ['details/projects/'] })

      await expect(capture()).resolves.toEqual({
         outcome: 'PARTIAL',
         pages: DETAIL_PAGES.length,
         missed: 1,
      })

      expect(attached).not.toHaveProperty(['detail-projects.html'])
      expect(attached).toHaveProperty(['detail-skills.html'])
      expect(context.warn).toHaveBeenCalledWith('The page did not open.')
   })

   it('should stop after several pages in a row that will not open', async () => {
      const { capture, opened } = setup({ refuse: DETAIL_PAGES.map(({ path }) => path) })

      await expect(capture()).resolves.toMatchObject({
         outcome: 'PARTIAL',
         pages: 1,
         missed: DETAIL_PAGES.length,
      })

      expect(opened).toHaveLength(1 + 3)
   })

   it('should begin no new page when its time is up', async () => {
      const { capture, opened } = setup({ pauseMs: 3 * 60_000 })
      const result = await capture()

      expect(BUDGET_MS).toBe(10 * 60 * 1000)
      expect(result.outcome).toBe('PARTIAL')
      expect(opened.length).toBeLessThan(DETAIL_PAGES.length + 1)
   })

   it('should never put the address of the profile, which holds the name, in the log or a warning', async () => {
      const { capture, context } = setup({ refuse: ['details/skills/'] })

      await capture()

      const said = [...context.log.mock.calls, ...context.warn.mock.calls].flat().join(' ')

      expect(said).not.toMatch(/ada-test|linkedin\.com/)
   })
})
