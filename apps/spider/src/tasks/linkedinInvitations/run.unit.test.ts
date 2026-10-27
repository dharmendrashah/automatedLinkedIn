import { describe, expect, it, vi } from 'vitest'

import { invitationsFileSchema } from '@automatedLinkedIn/contracts'

import { type FixtureInvitation, invitationsPage } from '../../linkedin/invitationFixture'
import { runInvitations } from './run'

const BASE = 'https://www.linkedin.com'
const LIST = `${BASE}/mynetwork/invitation-manager/`

const person = (index: number, extra: Partial<FixtureInvitation> = {}): FixtureInvitation => ({
   id: `75207529307029831${String(index).padStart(2, '0')}`,
   slug: `person-${index}`,
   name: `Person Number${index}`,
   headline: `Works at Company ${index}`,
   ...extra,
})

type Page = {
   rows?: FixtureInvitation[]
   // The address the page is at once it opened.
   at?: string
   all?: number
   // The list says "No new invitations".
   none?: boolean
   // How many rows the page draws at first, and how many more each scroll adds (a long list loads as it is scrolled).
   chunk?: number
   // Requests whose button does not land, and requests that stay on the page after the click.
   unclickable?: string[]
   stays?: string[]
   // How many looks at the page find the row still there after a click that took.
   leavesAfter?: number
   // The page cannot be read once a click was made.
   breaksAfterClick?: boolean
   // How many looks at the page find it empty.
   slow?: number
   markAttempt?: boolean
}

const setup = (page: Page = {}) => {
   const { rows = [person(1), person(2), person(3)], at = LIST, chunk = Infinity, markAttempt = true } = page
   const gone = new Set<string>()
   const pending = new Map<string, number>()
   const calls: string[] = []
   const attached: Record<string, string> = {}
   const clicks: string[] = []
   let scrolls = 0
   let looks = 0
   let slow = page.slow ?? 0

   const html = () => {
      if (page.breaksAfterClick && clicks.length > 0) {
         throw new Error('The page is moving')
      }

      if (slow > 0) {
         slow -= 1

         return '<html><body></body></html>'
      }

      looks += 1

      for (const [id, left] of pending) {
         if (left <= 1) {
            pending.delete(id)
            gone.add(id)
         } else {
            pending.set(id, left - 1)
         }
      }

      const shown = rows
         .filter(({ id }) => !gone.has(id))
         .slice(0, chunk === Infinity ? undefined : chunk * (1 + scrolls))

      return invitationsPage(shown, {
         all: page.all,
         none: page.none,
      })
   }

   const browser = {
      pageHtml: vi.fn(async () => html()),
      inspect: vi.fn(async () => ({
         url: at,
         title: '',
         viewport: {
            width: 1280,
            height: 720,
         },
         scrollY: 0,
         links: [],
         controls: [],
         blocks: [],
      })),
      scrollBy: vi.fn(async () => true),
      scrollOver: vi.fn(async () => {
         scrolls += 1

         return true
      }),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
      press: vi.fn(async () => ''),
      clickNth: vi.fn(async (selector: string, index: number, avoid: string, bringIntoView?: boolean) => {
         const [, id = '', label = ''] =
            /urn:li:invitation:(\d+)"\] button\[aria-label\^="(Accept |Ignore an invitation)"\]/.exec(selector) ?? []
         const action = label === 'Accept ' ? 'accept' : 'ignore'

         calls.push(`click ${action} ${id} nth=${index} avoid="${avoid}" into=${String(bringIntoView)}`)

         if (page.unclickable?.includes(id) || gone.has(id)) {
            return false
         }

         clicks.push(`${action} ${id}`)

         if (!page.stays?.includes(id)) {
            pending.set(id, page.leavesAfter ?? 1)
         }

         return true
      }),
      clickSelector: vi.fn(async () => false),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => at),
   }
   const context = {
      browser,
      visit: vi.fn(async () => at),
      pause: vi.fn(async (ms: number) => {
         calls.push(`pause ${ms}`)
      }),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) => {
         attached[name] = content
      }),
      screenshot: vi.fn(async () => undefined),
      markAttempt: vi.fn(async () => {
         calls.push('markAttempt')

         return markAttempt
      }),
   }

   return {
      context,
      browser,
      calls,
      clicks,
      attached,
      looks: () => looks,
      file: () => invitationsFileSchema.parse(JSON.parse(attached['invitations.json'] ?? 'null')),
      run: (answers: Array<{ id: string; action: 'ACCEPT' | 'IGNORE' }> = []) =>
         runInvitations(
            context as never,
            BASE,
            { answers },
            {
               random: () => 0.5,
               now: () => Date.UTC(2026, 9, 27),
            }
         ),
   }
}

describe('runInvitations', () => {
   it('should read the requests of the page and hand them over, clicking nothing', async () => {
      const { run, file, clicks, context } = setup({ all: 3 })

      await expect(run()).resolves.toEqual({
         outcome: 'DONE',
         read: 3,
         asked: 0,
         answered: 0,
      })
      expect(file()).toMatchObject({
         total: 3,
         complete: true,
         outcomes: [],
         invitations: [{ id: person(1).id }, { id: person(2).id }, { id: person(3).id }],
      })
      expect(clicks).toEqual([])
      expect(context.markAttempt).not.toHaveBeenCalled()
      expect(context.visit).toHaveBeenCalledWith(LIST)
   })

   it('should accept and ignore in the order asked, once each, after asking markAttempt once before the first click', async () => {
      const { run, calls, clicks, file, context } = setup()

      await expect(
         run([
            {
               id: person(2).id,
               action: 'ACCEPT',
            },
            {
               id: person(1).id,
               action: 'IGNORE',
            },
         ])
      ).resolves.toEqual({
         outcome: 'DONE',
         read: 1,
         asked: 2,
         answered: 2,
      })
      expect(clicks).toEqual([`accept ${person(2).id}`, `ignore ${person(1).id}`])
      expect(context.markAttempt).toHaveBeenCalledTimes(1)
      expect(calls.indexOf('markAttempt')).toBeLessThan(calls.findIndex(call => call.startsWith('click')))
      expect(calls.filter(call => call.startsWith('click'))).toEqual([
         `click accept ${person(2).id} nth=0 avoid="" into=true`,
         `click ignore ${person(1).id} nth=0 avoid="" into=true`,
      ])
      expect(file().outcomes).toEqual([
         {
            id: person(2).id,
            action: 'ACCEPT',
            outcome: 'ACCEPTED',
         },
         {
            id: person(1).id,
            action: 'IGNORE',
            outcome: 'IGNORED',
         },
      ])
      expect(file().invitations.map(({ id }) => id)).toEqual([person(3).id])
   })

   it('should rest between 4 and 9 seconds between two answers, and not before the first one for as long', async () => {
      const { run, calls } = setup()

      await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
         {
            id: person(2).id,
            action: 'ACCEPT',
         },
      ])

      const clickAt = calls.map((call, index) => (call.startsWith('click') ? index : -1)).filter(index => index >= 0)
      const between = calls
         .slice((clickAt[0] ?? 0) + 1, clickAt[1])
         .map(call => Number(/^pause (\d+)$/.exec(call)?.[1] ?? 0))

      expect(Math.max(...between)).toBeGreaterThanOrEqual(4000)
      expect(Math.max(...between)).toBeLessThanOrEqual(9000)
   })

   it('should call a request that is no longer on the page gone, click nothing for it, and ask markAttempt only for a click', async () => {
      const { run, clicks, context, file } = setup()
      const result = await run([
         {
            id: '7520752930702983999',
            action: 'ACCEPT',
         },
      ])

      expect(result).toMatchObject({
         outcome: 'PARTIAL',
         asked: 1,
         answered: 0,
      })
      expect(clicks).toEqual([])
      expect(context.markAttempt).not.toHaveBeenCalled()
      expect(file().outcomes[0]?.outcome).toBe('GONE')
   })

   it('should say it is not sure, and click no more, when the request stays on the page after its click', async () => {
      const { run, clicks, file } = setup({ stays: [person(1).id] })
      const result = await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
         {
            id: person(2).id,
            action: 'ACCEPT',
         },
      ])

      expect(result).toMatchObject({
         outcome: 'UNKNOWN',
         answered: 0,
      })
      expect(clicks).toEqual([`accept ${person(1).id}`])
      expect(file().outcomes.map(({ outcome }) => outcome)).toEqual(['UNSURE', 'NOT_CLICKED'])
   })

   it('should click nothing and say it is not sure when the same command was delivered again', async () => {
      const { run, clicks, file } = setup({ markAttempt: false })
      const result = await run([
         {
            id: person(1).id,
            action: 'IGNORE',
         },
      ])

      expect(result).toMatchObject({ outcome: 'UNKNOWN' })
      expect(clicks).toEqual([])
      expect(file().outcomes[0]?.outcome).toBe('NOT_CLICKED')
   })

   it('should stop at a button that cannot be clicked, leaving the rest not clicked', async () => {
      const { run, clicks, file } = setup({ unclickable: [person(1).id] })
      const result = await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
         {
            id: person(2).id,
            action: 'ACCEPT',
         },
      ])

      expect(result).toMatchObject({ outcome: 'PARTIAL' })
      expect(clicks).toEqual([])
      expect(file().outcomes.map(({ outcome }) => outcome)).toEqual(['NOT_CLICKED', 'NOT_CLICKED'])
   })

   it('should wait for the request to leave the page before it calls an answer taken', async () => {
      const { run, file } = setup({ leavesAfter: 4 })

      await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
      ])

      expect(file().outcomes[0]?.outcome).toBe('ACCEPTED')
   })

   it('should answer SIGNED_OUT on a sign-in page and click nothing', async () => {
      const { run, clicks, attached } = setup({ at: `${BASE}/uas/login` })

      await expect(
         run([
            {
               id: person(1).id,
               action: 'ACCEPT',
            },
         ])
      ).resolves.toEqual({ outcome: 'SIGNED_OUT' })
      expect(clicks).toEqual([])
      expect(attached).toEqual({})
   })

   it('should not call a page empty that never drew a request, and keep looking for it first', async () => {
      const { run, looks } = setup({ rows: [] })

      await expect(run()).resolves.toEqual({ outcome: 'NOT_DRAWN' })
      expect(looks()).toBeGreaterThanOrEqual(20)
   })

   it('should wait for a slow page to draw its requests', async () => {
      const { run } = setup({ slow: 6 })

      await expect(run()).resolves.toMatchObject({
         outcome: 'DONE',
         read: 3,
      })
   })

   it('should take a page that says it holds none as an empty list', async () => {
      const { run, file } = setup({
         rows: [],
         all: 0,
      })

      await expect(run()).resolves.toMatchObject({
         outcome: 'DONE',
         read: 0,
      })
      expect(file()).toMatchObject({
         total: 0,
         complete: true,
         invitations: [],
      })
   })

   it('should take the list’s own words that there is none as an empty list, without scrolling for more', async () => {
      const { run, file, browser } = setup({
         rows: [],
         none: true,
      })

      await expect(run()).resolves.toEqual({
         outcome: 'DONE',
         read: 0,
         asked: 0,
         answered: 0,
      })
      expect(file()).toMatchObject({
         complete: true,
         invitations: [],
      })
      expect(browser.scrollOver).not.toHaveBeenCalled()
   })

   it('should call every request asked for gone on a page that says there is none, and click nothing', async () => {
      const { run, clicks, context, file } = setup({
         rows: [],
         none: true,
      })

      await expect(
         run([
            {
               id: person(1).id,
               action: 'ACCEPT',
            },
         ])
      ).resolves.toMatchObject({ outcome: 'PARTIAL' })
      expect(clicks).toEqual([])
      expect(context.markAttempt).not.toHaveBeenCalled()
      expect(file().outcomes[0]?.outcome).toBe('GONE')
   })

   it('should scroll a long list for more, and say it is not complete when it holds more than it keeps', async () => {
      const rows = Array.from({ length: 130 }, (_, index) => person(index + 1))
      const { run, file } = setup({
         rows,
         chunk: 10,
      })
      const result = await run()

      expect(result).toMatchObject({
         outcome: 'PARTIAL',
         read: 100,
      })
      expect(file().invitations).toHaveLength(100)
      expect(file().complete).toBe(false)
   })

   it('should scroll until the list stops growing and then call it complete', async () => {
      const rows = Array.from({ length: 25 }, (_, index) => person(index + 1))
      const { run, file } = setup({
         rows,
         chunk: 10,
      })

      await expect(run()).resolves.toMatchObject({
         outcome: 'DONE',
         read: 25,
      })
      expect(file().complete).toBe(true)
   })

   it('should not call a read complete when a row could not be read', async () => {
      const { run, file } = setup({ rows: [person(1), person(2, { nameless: true }), person(3)] })

      await expect(run()).resolves.toMatchObject({
         outcome: 'PARTIAL',
         read: 2,
      })
      expect(file().complete).toBe(false)
   })

   it('should say it is not sure when the page cannot be read after a click, and hand over what it has', async () => {
      const { run, file, context } = setup({ breaksAfterClick: true })
      const result = await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
      ])

      expect(result).toMatchObject({ outcome: 'UNKNOWN' })
      expect(file().outcomes[0]?.outcome).toBe('UNSURE')
      expect(context.warn).toHaveBeenCalled()
   })

   it('should keep every name, headline and note out of the log', async () => {
      const { run, context } = setup({
         rows: [
            person(1, {
               note: ['Hello there'],
               mutual: 'Someone Else is a mutual connection',
            }),
         ],
      })

      await run([
         {
            id: person(1).id,
            action: 'ACCEPT',
         },
      ])

      const logged = JSON.stringify([...context.log.mock.calls, ...context.warn.mock.calls])

      expect(logged).not.toMatch(/Person|Company|Hello|Someone/)
   })
})
