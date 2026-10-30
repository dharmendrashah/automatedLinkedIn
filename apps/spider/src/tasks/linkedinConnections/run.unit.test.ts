import { describe, expect, it, vi } from 'vitest'

import { connectionsFileSchema } from '@automatedLinkedIn/contracts'

import {
   type FixtureConnection,
   PLAIN_REMOVE_MENU,
   REMOVE_MENU,
   connectionsPage,
   removeDialog,
} from '../../linkedin/connectionFixture'
import { runConnections } from './run'

const BASE = 'https://www.linkedin.com'
const LIST = `${BASE}/mynetwork/invite-connect/connections/`

const person = (index: number, extra: Partial<FixtureConnection> = {}): FixtureConnection => ({
   slug: `person-${index}`,
   name: `Person${index} Number${index}`,
   headline: `Works at Company ${index}`,
   ...extra,
})

const many = (count: number) => Array.from({ length: count }, (_, index) => person(index + 1))

type Page = {
   rows?: FixtureConnection[]
   // The address the page is at once it opened.
   at?: string
   // The heading's number; none leaves the heading out.
   total?: number | null
   // How many rows the page draws at first, and how many more each scroll adds (a long list loads as it is scrolled).
   chunk?: number
   // The three dots of a row that do not open a menu, and the name the dialog gives instead of the row's own.
   noMenu?: string[]
   // The dots are pressed but the menu never draws.
   shut?: boolean
   // The menu and the dialog of the layout with no data-view-name.
   plain?: boolean
   dialogName?: string
   // The row stays after Remove is pressed, and no toast shows.
   stays?: boolean
   // The page cannot be read once Remove was pressed.
   breaksAfterConfirm?: boolean
   // How many looks at the page find nothing drawn yet.
   slow?: number
   markAttempt?: boolean
}

const TOAST = '<div><p>Connection removed.</p></div>'

const setup = (page: Page = {}) => {
   const { rows = many(3), at = LIST, chunk = Infinity, markAttempt = true } = page
   const total = page.total === null ? undefined : (page.total ?? rows.length)
   const gone = new Set<string>()
   const calls: string[] = []
   const attached: Record<string, string> = {}
   const clicks: string[] = []
   let scrolls = 0
   let slow = page.slow ?? 0
   let menuFor: string | undefined
   let dialogFor: string | undefined
   let toast = false

   const html = () => {
      if (page.breaksAfterConfirm && clicks.some(click => click.startsWith('remove'))) {
         throw new Error('The page is moving')
      }

      if (slow > 0) {
         slow -= 1

         return '<html><body></body></html>'
      }

      const shown = rows
         .filter(({ slug }) => !gone.has(slug))
         .slice(0, chunk === Infinity ? undefined : chunk * (1 + scrolls))
      const row = rows.find(({ slug }) => slug === dialogFor)

      return connectionsPage(shown, {
         ...(total !== undefined && { total: total - gone.size }),
         extra: `${menuFor ? (page.plain ? PLAIN_REMOVE_MENU : REMOVE_MENU) : ''}${row ? removeDialog(page.dialogName ?? row.name.split(' ')[0] ?? '', page.plain) : ''}${toast ? TOAST : ''}`,
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
      clickNth: vi.fn(async (selector: string, index: number) => {
         const [, slug = ''] = /-([A-Za-z0-9_%-]+)"\] button\[aria-label\^="More actions for"\]$/.exec(selector) ?? []

         if (slug) {
            calls.push(`menu ${slug}`)

            if (page.noMenu?.includes(slug) || gone.has(slug)) {
               return false
            }

            menuFor = page.shut ? undefined : slug

            return true
         }

         if (selector === '[role="menuitem"]') {
            calls.push('item')
            dialogFor = menuFor
            menuFor = undefined

            return dialogFor !== undefined
         }

         // The dialog's buttons in the order it draws them: Dismiss, Cancel, Remove connection.
         if (selector === 'dialog button' && index === 1) {
            calls.push('cancel')
            dialogFor = undefined

            return true
         }

         if (selector === 'dialog button' && index === 2) {
            calls.push('confirm')
            clicks.push(`remove ${dialogFor ?? ''}`)

            if (!page.stays && dialogFor) {
               gone.add(dialogFor)
               toast = true
            }

            dialogFor = undefined

            return true
         }

         return false
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
      calls,
      clicks,
      attached,
      file: () => connectionsFileSchema.parse(JSON.parse(attached['connections.json'] ?? 'null')),
      run: (remove?: string) =>
         runConnections(
            context as never,
            BASE,
            { ...(remove && { remove }) },
            {
               random: () => 0.5,
               now: () => Date.UTC(2026, 9, 28),
            }
         ),
   }
}

describe('runConnections', () => {
   it('should read the connections of the page and hand them over, clicking nothing', async () => {
      const { run, file, clicks, context } = setup({ total: 3 })

      await expect(run()).resolves.toEqual({
         outcome: 'DONE',
         read: 3,
      })
      expect(file()).toMatchObject({
         total: 3,
         complete: true,
         connections: [{ slug: 'person-1' }, { slug: 'person-2' }, { slug: 'person-3' }],
      })
      expect(file().removal).toBeUndefined()
      expect(clicks).toEqual([])
      expect(context.markAttempt).not.toHaveBeenCalled()
      expect(context.visit).toHaveBeenCalledWith(LIST)
   })

   it('should stop at the first connection already stored, call the read done, and never call the list whole', async () => {
      const { context, file } = setup({
         rows: many(30),
         chunk: 10,
      })

      await expect(
         runConnections(
            context as never,
            BASE,
            { stopAtKnown: ['person-14', 'person-15'] },
            {
               random: () => 0.5,
               now: () => Date.UTC(2026, 9, 28),
            }
         )
      ).resolves.toEqual({
         outcome: 'DONE',
         read: 20,
      })
      expect(file().complete).toBe(false)
   })

   it('should read a page made in the layout with no data-view-name just the same', async () => {
      const { run, file } = setup({
         rows: many(3).map(row => ({
            ...row,
            plain: true,
         })),
      })

      await expect(run()).resolves.toEqual({
         outcome: 'DONE',
         read: 3,
      })
      expect(file().connections.map(({ slug }) => slug)).toEqual(['person-1', 'person-2', 'person-3'])
   })

   it('should keep the page when a row could not be read, so its shape can be studied, and not otherwise', async () => {
      const broken = setup({ rows: [person(1, { name: '' }), person(2)] })

      await expect(broken.run()).resolves.toMatchObject({
         outcome: 'PARTIAL',
         read: 1,
      })
      expect(broken.attached['connections-page.html']).toContain('ConnectionCard_0-person-1')

      const fine = setup()

      await fine.run()

      expect(fine.attached['connections-page.html']).toBeUndefined()
   })

   it('should scroll a long list until it has every connection the heading counts, then stop', async () => {
      const { run, file } = setup({
         rows: many(35),
         chunk: 10,
      })

      await expect(run()).resolves.toMatchObject({
         outcome: 'DONE',
         read: 35,
      })
      expect(file().connections).toHaveLength(35)
      expect(file().complete).toBe(true)
   })

   it('should say a read is not complete when the list stops before the heading’s count, and leave nobody out as gone by it', async () => {
      const { run, file } = setup({
         rows: many(12),
         total: 40,
         chunk: 10,
      })

      await expect(run()).resolves.toMatchObject({
         outcome: 'PARTIAL',
         read: 12,
      })
      expect(file()).toMatchObject({
         total: 40,
         complete: false,
      })
   })

   it('should keep the loaded page open for 5 seconds as the last thing it does, and not on a sign-in page', async () => {
      const read = setup()
      const never = setup({
         rows: [],
         total: null,
      })
      const signedOut = setup({ at: `${BASE}/uas/login` })

      await read.run()
      await never.run()
      await signedOut.run()

      expect(read.calls.at(-1)).toBe('pause 5000')
      expect(read.attached['connections.json']).toBeDefined()
      expect(never.calls.at(-1)).toBe('pause 5000')
      expect(signedOut.calls).not.toContain('pause 5000')
   })

   it('should say a page that draws nothing and does not say there are none is not called empty', async () => {
      const { run, attached } = setup({
         rows: [],
         total: null,
      })

      await expect(run()).resolves.toEqual({ outcome: 'NOT_DRAWN' })
      expect(attached['connections.json']).toBeUndefined()
   })

   it('should wait for a slow page to draw before it calls it empty', async () => {
      const { run } = setup({ slow: 4 })

      await expect(run()).resolves.toMatchObject({
         outcome: 'DONE',
         read: 3,
      })
   })

   it('should read an account with no connection as done, with the page’s own word', async () => {
      const { run, file } = setup({
         rows: [],
         total: 0,
      })

      await expect(run()).resolves.toEqual({
         outcome: 'DONE',
         read: 0,
      })
      expect(file().connections).toEqual([])
   })

   it('should answer SIGNED_OUT on a sign-in page, and click nothing', async () => {
      const { run, clicks } = setup({ at: `${BASE}/uas/login` })

      await expect(run('person-2')).resolves.toEqual({ outcome: 'SIGNED_OUT' })
      expect(clicks).toEqual([])
   })

   describe('removing one connection', () => {
      it('should scroll to the row, open its menu, check the dialog names the person, ask markAttempt once just before the confirm, press it once and say removed', async () => {
         const { run, calls, clicks, file, context } = setup({
            rows: many(35),
            chunk: 10,
         })

         await expect(run('person-23')).resolves.toMatchObject({
            outcome: 'DONE',
            removal: 'REMOVED',
         })
         expect(clicks).toEqual(['remove person-23'])
         expect(context.markAttempt).toHaveBeenCalledTimes(1)
         expect(calls.filter(call => call !== 'markAttempt' && !call.startsWith('pause'))).toEqual([
            'menu person-23',
            'item',
            'confirm',
         ])
         expect(calls.indexOf('markAttempt')).toBe(calls.indexOf('confirm') - 1)
         expect(file().removal).toEqual({
            slug: 'person-23',
            outcome: 'REMOVED',
         })
         // The list was not read to its end: nobody is called gone by this run.
         expect(file().complete).toBe(false)
      })

      it('should click nothing and say GONE when the connection is not on the list', async () => {
         const { run, clicks, calls, file } = setup({
            rows: many(12),
            chunk: 10,
         })

         await expect(run('person-99')).resolves.toMatchObject({
            outcome: 'PARTIAL',
            removal: 'GONE',
         })
         expect(clicks).toEqual([])
         expect(calls).not.toContain('markAttempt')
         expect(file().removal).toEqual({
            slug: 'person-99',
            outcome: 'GONE',
         })
      })

      it('should cancel and press nothing when the dialog names someone else', async () => {
         const { run, clicks, calls, file } = setup({ dialogName: 'Somebody' })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'PARTIAL',
            removal: 'NOT_CLICKED',
         })
         expect(clicks).toEqual([])
         expect(calls).toContain('cancel')
         expect(calls).not.toContain('markAttempt')
         expect(file().removal?.outcome).toBe('NOT_CLICKED')
      })

      it('should stop with nothing pressed when the three dots do not open a menu', async () => {
         const { run, clicks, calls } = setup({ noMenu: ['person-2'] })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'PARTIAL',
            removal: 'NOT_CLICKED',
         })
         expect(clicks).toEqual([])
         expect(calls).not.toContain('markAttempt')
      })

      it('should find the menu and the dialog by their words when the page has no data-view-name, and press Remove once', async () => {
         const { run, clicks, calls } = setup({ plain: true })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'DONE',
            removal: 'REMOVED',
         })
         expect(clicks).toEqual(['remove person-2'])
         expect(calls.filter(call => call === 'confirm')).toHaveLength(1)
      })

      it('should keep the page it saw, and press nothing, when the menu does not draw', async () => {
         const { run, clicks, attached } = setup({ shut: true })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'PARTIAL',
            removal: 'NOT_CLICKED',
         })
         expect(clicks).toEqual([])
         expect(attached['removal-menu.html']).toContain('ConnectionCard_0-person-2')
      })

      it('should press nothing when the command was started before, and say it is not sure', async () => {
         const { run, clicks, file } = setup({ markAttempt: false })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'UNKNOWN',
            removal: 'NOT_CLICKED',
         })
         expect(clicks).toEqual([])
         expect(file().removal?.outcome).toBe('NOT_CLICKED')
      })

      it('should say it is not sure when the confirm was pressed and the row stays with no word from the page', async () => {
         const { run, clicks, file } = setup({ stays: true })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'UNKNOWN',
            removal: 'UNSURE',
         })
         expect(clicks).toEqual(['remove person-2'])
         expect(file().removal?.outcome).toBe('UNSURE')
      })

      it('should still hand over what it has, and say not sure, when the page cannot be read after the confirm', async () => {
         const { run, clicks, attached } = setup({ breaksAfterConfirm: true })

         await expect(run('person-2')).resolves.toMatchObject({
            outcome: 'UNKNOWN',
            removal: 'UNSURE',
         })
         expect(clicks).toEqual(['remove person-2'])
         expect(connectionsFileSchema.safeParse(JSON.parse(attached['connections.json'] ?? 'null')).success).toBe(true)
      })
   })
})
