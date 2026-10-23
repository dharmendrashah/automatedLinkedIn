import { describe, expect, it, vi } from 'vitest'

import { messagesFileSchema } from '@automatedLinkedIn/contracts'

import { COMPOSER, SEND_BUTTON } from '../../linkedin/markup'
import { threadMarkup } from '../../linkedin/messagingFixture'
import { sendReply } from './send'

const BASE = 'https://www.linkedin.com'
const THREAD = '2-ada'
const TEXT = 'Thanks Ada, tomorrow at ten works.'

type Page = {
   // The address the page is at after it was opened.
   at?: string
   title?: string
   composer?: boolean
   // The send button works once something is typed.
   sendWorks?: boolean
   // The typing reaches the box.
   typingWorks?: boolean
   // After the send button is pressed: the message shows at once, after some looks, or never.
   appears?: 'now' | 'late' | 'never'
   // Whether the box is emptied by a send that did not show a message (a send that went and cannot be seen).
   clears?: boolean
}

const setup = (page: Page = {}) => {
   const { at = `${BASE}/messaging/thread/${THREAD}/`, title = 'Ada Lovelace', composer = true } = page
   const { sendWorks = true, typingWorks = true, appears = 'now', clears = true } = page
   let focused = false
   let typed = ''
   let pressed = false
   let looks = 0
   let shown = false
   const sentTexts: string[] = []
   const attached: Record<string, string> = {}
   const calls: string[] = []
   const html = () => {
      if (pressed && appears === 'late') {
         looks += 1
         shown = looks >= 3
      }

      return `<html><body>${threadMarkup({
         title,
         profile: `${BASE}/in/ada/`,
         messages: [
            {
               id: 'a',
               from: 'THEM',
               name: 'Ada Lovelace',
               profile: `${BASE}/in/ada/`,
               time: '9:00 AM',
               day: 'Today',
               text: 'Can we meet?',
            },
            ...(shown
               ? [
                    {
                       id: 'b',
                       from: 'ME' as const,
                       name: 'Tripti Verma',
                       profile: `${BASE}/in/me/`,
                       time: '9:05 AM',
                       text: TEXT,
                    },
                 ]
               : []),
         ],
         ...(composer && {
            composer: {
               typed,
               sendDisabled: typed === '' || !sendWorks,
            },
         }),
      })}</body></html>`
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
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
      press: vi.fn(async (key: string) => {
         calls.push(`press ${key}`)

         if (key === 'Delete') {
            typed = ''
         }

         return ''
      }),
      clickSelector: vi.fn(async (selector: string) => {
         if (selector === COMPOSER) {
            calls.push('click composer')
            focused = true

            return composer
         }

         if (selector === SEND_BUTTON) {
            calls.push('click send')

            if (typed === '' || !sendWorks) {
               return false
            }

            pressed = true
            sentTexts.push(typed)

            if (appears === 'now') {
               shown = true
            }

            if (clears || appears === 'now') {
               typed = ''
            }

            return true
         }

         return false
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push('type')

         if (focused && typingWorks) {
            typed += text
         }
      }),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => at),
   }
   const context = {
      browser,
      visit: vi.fn(async () => at),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) => {
         attached[name] = content
      }),
      screenshot: vi.fn(async () => undefined),
      markAttempt: vi.fn(async () => true),
   }

   return {
      context,
      browser,
      calls,
      sentTexts,
      attached,
      send: (input: { thread?: string; text?: string; title?: string } = {}) =>
         sendReply(
            context as never,
            BASE,
            {
               thread: THREAD,
               text: TEXT,
               title: 'Ada Lovelace',
               ...input,
            },
            {
               random: () => 0.5,
               now: () => 0,
               today: () => new Date(Date.UTC(2026, 9, 22)),
            }
         ),
   }
}

describe('sendReply', () => {
   it('should type the words, press send once, and say it was sent when the message shows as the newest of the account', async () => {
      const { send, calls, sentTexts, attached, context } = setup()

      await expect(send()).resolves.toEqual({ outcome: 'SENT' })

      expect(calls).toEqual(['click composer', 'type', 'click send'])
      expect(sentTexts).toEqual([TEXT])
      expect(context.markAttempt).toHaveBeenCalledTimes(1)

      const file = messagesFileSchema.parse(JSON.parse(attached['messages.json'] ?? 'null'))

      expect(file.conversations[0]).toMatchObject({
         id: THREAD,
         title: 'Ada Lovelace',
         complete: false,
      })
      expect(file.conversations[0]?.messages.at(-1)).toMatchObject({ direction: 'ME' })
      expect(file.account).toBeUndefined()
   })

   it('should look again for a message that shows a moment late', async () => {
      const { send, browser } = setup({ appears: 'late' })

      await expect(send()).resolves.toEqual({ outcome: 'SENT' })
      expect(browser.pageHtml.mock.calls.length).toBeGreaterThan(4)
   })

   it('should type nothing when the same command was delivered before, and say it may have been sent', async () => {
      const { send, context, calls } = setup()

      context.markAttempt.mockResolvedValue(false)

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(calls).toEqual([])
   })

   it('should type nothing in another conversation than the one asked for, by its address or its name', async () => {
      const wrongAddress = setup({ at: `${BASE}/messaging/thread/2-other/` })
      const wrongName = setup({ title: 'Someone Else' })

      await expect(wrongAddress.send()).resolves.toEqual({ outcome: 'WRONG_THREAD' })
      await expect(wrongName.send()).resolves.toEqual({ outcome: 'WRONG_THREAD' })
      expect(wrongAddress.calls).toEqual([])
      expect(wrongName.calls).toEqual([])
      expect(wrongName.context.markAttempt).not.toHaveBeenCalled()
   })

   it('should say it is not allowed where the page offers no place to write', async () => {
      const { send, calls } = setup({ composer: false })

      await expect(send()).resolves.toEqual({ outcome: 'NO_COMPOSER' })
      expect(calls).toEqual([])
   })

   it('should not press send when the words did not get into the box, and empty it', async () => {
      const { send, calls } = setup({ typingWorks: false })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'TYPING',
      })
      expect(calls).not.toContain('click send')
   })

   it('should not press send when the button stays disabled, and empty the box', async () => {
      const { send, calls } = setup({ sendWorks: false })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_DISABLED',
      })
      expect(calls).not.toContain('click send')
      expect(calls).toContain('press Delete')
   })

   it('should say it failed when the message did not show and the words are still in the box', async () => {
      const { send, calls } = setup({
         appears: 'never',
         clears: false,
      })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })
      expect(calls.filter(call => call === 'click send')).toHaveLength(1)
      expect(calls).toContain('press Delete')
   })

   it('should say it is unsure when the box was emptied and the message cannot be seen, and still hand over what the page shows', async () => {
      const { send, attached } = setup({
         appears: 'never',
         clears: true,
      })

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(Object.keys(attached)).toEqual(['messages.json'])
   })

   it('should say it is unsure, not fail, when the page cannot be read after send was pressed', async () => {
      const { send, browser, calls } = setup()
      const read = browser.pageHtml.getMockImplementation()

      browser.pageHtml.mockImplementation(async () => {
         if (calls.includes('click send')) {
            throw new Error('page closed')
         }

         return read?.() ?? ''
      })

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
   })

   it('should say signed out when LinkedIn asks for a sign-in', async () => {
      const { send, calls } = setup({ at: `${BASE}/uas/login` })

      await expect(send()).resolves.toEqual({ outcome: 'SIGNED_OUT' })
      expect(calls).toEqual([])
   })

   it('should never put the words or the name in the log', async () => {
      const { send, context } = setup()

      await send()

      const logged = JSON.stringify([...context.log.mock.calls, ...context.warn.mock.calls])

      expect(logged).not.toContain('Thanks Ada')
      expect(logged).not.toContain('Ada Lovelace')
   })
})
