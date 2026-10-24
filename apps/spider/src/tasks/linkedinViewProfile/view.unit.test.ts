import { describe, expect, it, vi } from 'vitest'

import { aboutMarkup, profilePage, topCardMarkup } from '../../linkedin/profileFixture'
import { VisitError } from '../defineTask'
import { viewProfile } from './view'

const BASE = 'https://www.linkedin.com'
const ADDRESS = `${BASE}/in/ada-lovelace/`

const profile = profilePage(
   topCardMarkup({
      name: 'Ada Lovelace',
      headline: 'Mathematician at Analytical Engines',
      location: 'London, England',
   }),
   aboutMarkup('Notes on the engine.')
)

type Options = {
   // Where the address leads.
   lands?: string
   // How many wheel steps still move the page.
   moves?: number
}

const setup = ({ lands = ADDRESS, moves = 4 }: Options = {}) => {
   const events: string[] = []
   let remaining = moves
   const attached: Record<string, string> = {}
   const browser = {
      inspect: vi.fn(async () => ({ url: lands })),
      pageHtml: vi.fn(async () => profile),
      scrollBy: vi.fn(async () => {
         events.push('scroll')
         remaining -= 1

         return remaining >= 0
      }),
      clickLink: vi.fn(async () => undefined),
      clickNth: vi.fn(async () => false),
      click: vi.fn(async () => lands),
      back: vi.fn(async () => lands),
      clearCookies: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
      screenshot: vi.fn(async () => Buffer.from('png')),
   }
   const context = {
      browser,
      visit: vi.fn(async (url: string) => {
         events.push(`open ${url}`)

         return lands
      }),
      pause: vi.fn(async (ms: number) => {
         events.push(`wait ${ms}`)
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
      events,
      attached,
      view: (snapshots = false) => viewProfile(context as never, BASE, ADDRESS, { snapshots }, { random: () => 0.5 }),
   }
}

describe('viewProfile', () => {
   it('should open the address, wait 5 to 6 seconds, then scroll down until the page stops moving', async () => {
      const { view, events, browser } = setup()

      await expect(view()).resolves.toBe('DONE')

      const first = events.findIndex(event => event === 'scroll')
      const waited = events.slice(0, first).filter(event => {
         const ms = Number(event.replace('wait ', ''))

         return event.startsWith('wait ') && ms >= 5000 && ms <= 6000
      })

      expect(events[0]).toBe(`open ${ADDRESS}`)
      expect(waited).toHaveLength(1)
      // four steps that moved, then the steps that found the end
      expect(browser.scrollBy.mock.calls.length).toBeGreaterThanOrEqual(6)
      expect(events.at(-1)).toMatch(/^wait /)
   })

   it('should only open and scroll: nothing on the page is ever clicked', async () => {
      const { view, browser } = setup()

      await view()

      expect(browser.clickLink).not.toHaveBeenCalled()
      expect(browser.clickNth).not.toHaveBeenCalled()
      expect(browser.click).not.toHaveBeenCalled()
   })

   it('should say the profile is not available, and not wait or scroll, when the address leads away from a profile', async () => {
      const { view, events, browser } = setup({ lands: `${BASE}/feed/` })

      await expect(view()).resolves.toBe('NOT_AVAILABLE')

      expect(browser.scrollBy).not.toHaveBeenCalled()
      expect(events.some(event => event === 'wait 5500')).toBe(false)
   })

   it('should say signed out when LinkedIn asks for a sign-in', async () => {
      const { view, browser } = setup({ lands: `${BASE}/login` })

      await expect(view()).resolves.toBe('SIGNED_OUT')
      expect(browser.scrollBy).not.toHaveBeenCalled()
   })

   it('should let a page that could not be opened fail the run', async () => {
      const { view, context } = setup()

      context.visit.mockRejectedValue(new VisitError('load', 'The page did not open.'))

      await expect(view()).rejects.toBeInstanceOf(VisitError)
   })

   it('should never put the address, a name or a word of the profile in the log or a warning', async () => {
      const { view, context } = setup()

      await view()

      const said = [...context.log.mock.calls, ...context.warn.mock.calls].flat().join(' ')

      expect(said).not.toMatch(/ada|lovelace|Mathematician|engine|London/i)
   })

   it('should keep the page with the run only when asked to', async () => {
      const plain = setup()

      await plain.view()
      expect(Object.keys(plain.attached)).toEqual([])

      const kept = setup()

      await kept.view(true)
      expect(Object.keys(kept.attached)).toContain('profile.html')
   })
})
