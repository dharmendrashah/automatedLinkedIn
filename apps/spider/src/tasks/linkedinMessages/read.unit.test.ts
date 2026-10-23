import { describe, expect, it, vi } from 'vitest'

import { type MessagesFile, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { INBOX_LIST, INBOX_ROW, THREAD_PANE } from '../../linkedin/markup'
import { inboxMarkup, threadMarkup } from '../../linkedin/messagingFixture'
import { BUDGET_MS, readMessages } from './read'

const BASE = 'https://www.linkedin.com'
const MESSAGING = `${BASE}/messaging/`
const threadUrl = (index: number) => `${BASE}/messaging/thread/thread-${index}/`
// A row at a time shows up to this many of the list, as in a window of a real page.
const VISIBLE = 6
// How many rows a scroll of the list brings, and how many conversations the page adds when the list is scrolled to its end.
const SCROLL_ROWS = 4
const PAGE_ROWS = 10
// How many older messages a scroll up in a conversation brings.
const OLDER = 5

type Page = {
   // Conversations in the inbox, and how many messages each has.
   conversations?: number
   messages?: number
   // The conversation that, when opened, finds LinkedIn asking for a sign-in.
   signedOutAt?: number
   // Whether a click on a row does nothing.
   deaf?: boolean
   // Whether the messages open on the newest conversation by themselves, as the real page does (default).
   autoOpen?: boolean
   // How many looks at the address still show the conversation before, after a row was clicked: a conversation slow to open.
   slowOpen?: number
   // Milliseconds each pause adds to the clock.
   pauseMs?: number
}

// A messaging page that behaves like the real one: a list that shows a few rows and loads more when scrolled to its end, rows that
// open a conversation by a click with no address of their own, and a conversation that loads older messages as it is scrolled up.
const setup = (page: Page = {}) => {
   const { conversations = 8, messages = 12, signedOutAt, deaf = false, autoOpen = true, slowOpen = 0, pauseMs } = page
   let time = 0
   let loadedRows = Math.min(PAGE_ROWS, conversations)
   let top = 0
   let opened: number | undefined
   let loaded = 0
   let before: number | undefined
   let delay = 0
   // The page draws the rows near the window and keeps an empty item for the others, as the real one does.
   const drawn = () =>
      Array.from({ length: loadedRows }, (_, index) => index).filter(index => index >= top && index < top + VISIBLE + 2)
   const attached: Record<string, string> = {}
   const rowsHtml = () =>
      inboxMarkup(
         Array.from({ length: loadedRows }, (_, index) => ({
            title: `Person ${index}`,
            when: 'Jan 16',
            snippet: `last words ${index}`,
            unread: index === 1,
            placeholder: !drawn().includes(index),
         })),
         loadedRows < conversations
      )
   const threadHtml = () =>
      opened === undefined
         ? ''
         : threadMarkup({
              title: `Person ${opened}`,
              profile: `${BASE}/in/person-${opened}/`,
              messages: Array.from({ length: messages }, (_, index) => ({
                 id: `2-c${opened}-m${index}`,
                 from: index % 3 === 2 ? ('ME' as const) : ('THEM' as const),
                 name: index % 3 === 2 ? 'Tripti Verma' : `Person ${opened}`,
                 profile: index % 3 === 2 ? `${BASE}/in/me/` : `${BASE}/in/person-${opened}/`,
                 time: '5:18 PM',
                 day: index === 0 ? 'Jan 25, 2024' : undefined,
                 text: `secret words ${opened}/${index}`,
              })).slice(messages - loaded),
           })
   const urlOf = (index: number | undefined) => {
      if (index === undefined) {
         return MESSAGING
      }

      return signedOutAt === index ? `${BASE}/uas/login` : threadUrl(index)
   }
   const url = () => {
      if (delay > 0) {
         delay -= 1

         return urlOf(before)
      }

      return urlOf(opened)
   }
   const browser = {
      scrollBy: vi.fn(async (_pixels: number) => true),
      inspect: vi.fn(async (_options?: { block?: string }) => ({
         url: url(),
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
      pageHtml: vi.fn(async () => `<html><body>${rowsHtml()}${threadHtml()}</body></html>`),
      clickLink: vi.fn(async (_href: string, _avoid: string) => undefined),
      back: vi.fn(async () => MESSAGING),
      hover: vi.fn(async (_x: number, _y: number) => undefined),
      drift: vi.fn(async () => undefined),
      press: vi.fn(async (_key: string) => ''),
      clickSelector: vi.fn(async (_selector: string) => false),
      // The Nth click target is the Nth row that is drawn.
      clickNth: vi.fn(async (selector: string, nth: number, _avoid: string) => {
         const index = drawn()[nth]

         if (deaf || selector !== INBOX_ROW || index === undefined || index < top || index >= top + VISIBLE) {
            return false
         }

         before = opened
         delay = slowOpen
         opened = index
         loaded = Math.min(OLDER, messages)

         return true
      }),
      scrollOver: vi.fn(async (selector: string, pixels: number) => {
         if (selector === THREAD_PANE) {
            if (pixels < 0 && loaded < messages) {
               loaded = Math.min(messages, loaded + OLDER)

               return true
            }

            return false
         }

         if (selector !== INBOX_LIST) {
            return false
         }

         const before = top

         top =
            pixels > 0 ? Math.min(top + SCROLL_ROWS, Math.max(0, loadedRows - VISIBLE)) : Math.max(0, top - SCROLL_ROWS)

         if (pixels > 0 && top + VISIBLE >= loadedRows && loadedRows < conversations) {
            loadedRows = Math.min(conversations, loadedRows + PAGE_ROWS)
         }

         return top !== before
      }),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => MESSAGING),
      clearCookies: vi.fn(async () => undefined),
   }
   const context = {
      browser,
      visit: vi.fn(async (target: string) => {
         opened = autoOpen ? 0 : undefined
         loaded = autoOpen ? Math.min(OLDER, messages) : 0
         top = 0
         delay = 0

         return target
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
      context,
      browser,
      attached,
      file: () => JSON.parse(attached['messages.json'] ?? 'null') as MessagesFile,
      read: (input: { limit?: number; skip?: number; snapshots?: boolean } = {}) =>
         readMessages(
            context as never,
            BASE,
            {
               limit: 50,
               skip: 0,
               snapshots: false,
               ...input,
            },
            {
               random: () => 0.5,
               now: () => time,
               today: () => new Date(Date.UTC(2026, 9, 22)),
            }
         ),
   }
}

describe('readMessages', () => {
   it('should open each conversation of the list in order and read all of it, oldest message first, with sender and direction', async () => {
      const { read, file } = setup()

      await expect(read({ limit: 3 })).resolves.toEqual({
         outcome: 'DONE',
         conversations: 3,
         messages: 36,
      })

      const { conversations } = messagesFileSchema.parse(file())

      expect(conversations.map(conversation => conversation.id)).toEqual(['thread-0', 'thread-1', 'thread-2'])
      expect(conversations[0]).toMatchObject({
         title: 'Person 0',
         kind: 'DIRECT',
         unread: false,
         lastActivity: 'Jan 16',
         complete: true,
      })
      expect(conversations[1]?.unread).toBe(true)
      expect(conversations[0]?.messages).toHaveLength(12)
      expect(conversations[0]?.messages[0]).toMatchObject({
         sender: {
            name: 'Person 0',
            profileUrl: `${BASE}/in/person-0/`,
         },
         direction: 'THEM',
         date: '2024-01-25',
         time: '17:18',
         text: 'secret words 0/0',
      })
      expect(conversations[0]?.messages[2]).toMatchObject({
         direction: 'ME',
         sender: { name: 'Tripti Verma' },
      })
   })

   it('should scroll the list to rows below the window and let it load more conversations', async () => {
      const { read, file, browser } = setup({ conversations: 14 })

      await expect(read({ limit: 12 })).resolves.toMatchObject({
         outcome: 'DONE',
         conversations: 12,
      })

      expect(file().conversations.map(conversation => conversation.id)).toContain('thread-11')
      expect(browser.scrollOver.mock.calls.some(([selector]) => selector === INBOX_LIST)).toBe(true)
   })

   it('should wait for a conversation that is slow to open, and read the one that was asked for', async () => {
      const { read, file } = setup({ slowOpen: 3 })

      await expect(read({ limit: 3 })).resolves.toMatchObject({
         outcome: 'DONE',
         conversations: 3,
      })

      expect(file().conversations.map(conversation => conversation.id)).toEqual(['thread-0', 'thread-1', 'thread-2'])
   })

   it('should start after the rows to skip', async () => {
      const { read, file } = setup()

      await read({
         skip: 2,
         limit: 2,
      })

      expect(file().conversations.map(conversation => conversation.id)).toEqual(['thread-2', 'thread-3'])
   })

   it('should be done with fewer when the inbox has fewer conversations than asked', async () => {
      const { read } = setup({ conversations: 2 })

      await expect(read({ limit: 5 })).resolves.toMatchObject({
         outcome: 'DONE',
         conversations: 2,
      })
   })

   it('should stop beginning conversations when its time is up, and say it read part', async () => {
      const { read, file } = setup({ pauseMs: 6 * 60_000 })

      const result = await read({ limit: 10 })

      expect(BUDGET_MS).toBe(20 * 60 * 1000)
      expect(result.outcome).toBe('PARTIAL')
      expect(result.conversations).toBeGreaterThan(0)
      expect(result.conversations).toBeLessThan(10)
      expect(file().conversations).toHaveLength(result.conversations)
   })

   it('should keep what it read and say signed out when LinkedIn asks for a sign-in', async () => {
      const { read, file } = setup({ signedOutAt: 1 })

      await expect(read({ limit: 4 })).resolves.toEqual({
         outcome: 'SIGNED_OUT',
         conversations: 1,
         messages: 12,
      })

      expect(file().conversations.map(conversation => conversation.id)).toEqual(['thread-0'])
   })

   it('should give up after several conversations in a row that will not open, and make no file', async () => {
      const { read, attached, context } = setup({
         deaf: true,
         autoOpen: false,
      })

      await expect(read({ limit: 5 })).resolves.toEqual({
         outcome: 'PARTIAL',
         conversations: 0,
         messages: 0,
      })

      expect(attached).toEqual({})
      expect(context.warn).toHaveBeenCalled()
   })

   it('should never put a name or a word of a message in the log or a warning', async () => {
      const { read, context } = setup({
         deaf: true,
         autoOpen: false,
      })

      await read({ limit: 2 })

      const said = [...context.log.mock.calls, ...context.warn.mock.calls].flat().join(' ')

      expect(said).not.toMatch(/Person|secret|Tripti/)
   })

   it('should click a row only where no button of it is under the pointer', async () => {
      const { read, browser } = setup()

      await read({ limit: 1 })

      expect(browser.clickNth.mock.calls[0]?.[0]).toBe(INBOX_ROW)
      expect(browser.clickNth.mock.calls[0]?.[2]).toContain('button')
   })
})
