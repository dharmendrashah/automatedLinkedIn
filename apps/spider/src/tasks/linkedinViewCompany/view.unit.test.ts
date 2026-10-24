import { describe, expect, it, vi } from 'vitest'

import { VisitError } from '../defineTask'
import { viewCompany } from './view'

const BASE = 'https://www.linkedin.com'
const ADDRESS = `${BASE}/company/analytical-engines/`

const page = `<html lang="en"><body><section aria-label="Primary content"><h1>Analytical Engines</h1><p>Computing machines</p><p>London, England</p></section></body></html>`

type Options = {
   // Where the address leads.
   lands?: string
   // How many wheel steps still move the page.
   moves?: number
}

const setup = ({ lands = ADDRESS, moves = 3 }: Options = {}) => {
   const events: string[] = []
   let remaining = moves
   const attached: Record<string, string> = {}
   const browser = {
      inspect: vi.fn(async () => ({ url: lands })),
      pageHtml: vi.fn(async () => page),
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
      view: (snapshots = false) => viewCompany(context as never, BASE, ADDRESS, { snapshots }, { random: () => 0.5 }),
   }
}

describe('viewCompany', () => {
   it('should open the address, wait 5 to 6 seconds, then scroll down until the page stops moving, clicking nothing', async () => {
      const { view, events, browser } = setup()

      await expect(view()).resolves.toBe('DONE')

      const first = events.findIndex(event => event === 'scroll')
      const waited = events.slice(0, first).filter(event => {
         const ms = Number(event.replace('wait ', ''))

         return event.startsWith('wait ') && ms >= 5000 && ms <= 6000
      })

      expect(events[0]).toBe(`open ${ADDRESS}`)
      expect(waited).toHaveLength(1)
      expect(browser.scrollBy.mock.calls.length).toBeGreaterThanOrEqual(5)
      expect(browser.clickLink).not.toHaveBeenCalled()
      expect(browser.clickNth).not.toHaveBeenCalled()
      expect(browser.click).not.toHaveBeenCalled()
   })

   it.each(['/company/other-name/', '/school/analytical-engines/', '/showcase/analytical-engines-lab/'])(
      'should take a page it was sent to as a company page: %s',
      async path => {
         const { view, browser } = setup({ lands: `${BASE}${path}` })

         await expect(view()).resolves.toBe('DONE')
         expect(browser.scrollBy).toHaveBeenCalled()
      }
   )

   it.each(['/feed/', '/in/someone/', '/404/', '/'])(
      'should say the page is not available, and not wait or scroll, when the address leads to %s',
      async path => {
         const { view, browser } = setup({ lands: `${BASE}${path}` })

         await expect(view()).resolves.toBe('NOT_AVAILABLE')
         expect(browser.scrollBy).not.toHaveBeenCalled()
      }
   )

   it('should say signed out when LinkedIn asks for a sign-in', async () => {
      const { view } = setup({ lands: `${BASE}/login` })

      await expect(view()).resolves.toBe('SIGNED_OUT')
   })

   it('should let a page that could not be opened fail the run', async () => {
      const { view, context } = setup()

      context.visit.mockRejectedValue(new VisitError('load', 'The page did not open.'))

      await expect(view()).rejects.toBeInstanceOf(VisitError)
   })

   it('should never put the address, a name or a word of the page in the log or a warning', async () => {
      const { view, context } = setup()

      await view()

      const said = [...context.log.mock.calls, ...context.warn.mock.calls].flat().join(' ')

      expect(said).not.toMatch(/analytical|engines|computing|london/i)
   })

   it('should keep the page with the run only when asked to', async () => {
      const plain = setup()

      await plain.view()
      expect(Object.keys(plain.attached)).toEqual([])

      const kept = setup()

      await kept.view(true)
      expect(Object.keys(kept.attached)).toContain('company.html')
   })
})
