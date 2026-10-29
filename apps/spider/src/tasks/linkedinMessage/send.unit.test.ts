import { describe, expect, it, vi } from 'vitest'

import { messagesFileSchema } from '@automatedLinkedIn/contracts'

import { PROFILE_MESSAGE, WINDOW_COMPOSER, WINDOW_SEND_BUTTON } from '../../linkedin/markup'
import { type FixtureMessage, profileMarkup, threadMarkup } from '../../linkedin/messagingFixture'
import { answerFor } from './answer'
import { type MessageResult, sameName, sendMessage } from './send'

const BASE = 'https://www.linkedin.com'
const SLUG = 'ada-l'
const TEXT = 'Hi Ada, good to be connected.'

type Page = {
   // Where opening the profile and /messaging/ end.
   profileAt?: string
   inboxAt?: string
   messageLink?: boolean
   // The window opens when the link is pressed, and the name it shows.
   opens?: boolean
   title?: string
   composer?: boolean
   history?: FixtureMessage[]
   typingWorks?: boolean
   sendWorks?: boolean
   // After send: the message shows in the window, or never.
   appears?: boolean
   answer?: number
   // The newest conversation of /messaging/ after the send: with this name, and whether its newest message is ours with the words.
   inboxTitle?: string
   inboxOurs?: boolean
   attempted?: boolean
}

const ours = (id: string): FixtureMessage => ({
   id,
   from: 'ME',
   name: 'Tripti Verma',
   profile: `${BASE}/in/me/`,
   time: '9:05 AM',
   day: 'Today',
   text: TEXT,
})

const setup = (page: Page = {}) => {
   const { profileAt = `${BASE}/in/${SLUG}/`, inboxAt = `${BASE}/messaging/thread/2-new/` } = page
   const { messageLink = true, opens = true, title = 'Ada Lovelace', composer = true, history = [] } = page
   const { typingWorks = true, sendWorks = true, appears = true, inboxTitle = 'Ada Lovelace', inboxOurs = true } = page
   let at = ''
   let open = false
   let typed = ''
   let pressed = 0
   const calls: string[] = []
   const attached: Array<{ name: string; content: string }> = []
   const html = () => {
      if (at.includes('/messaging/')) {
         return `<html><body>${threadMarkup({
            title: inboxTitle,
            profile: `${BASE}/in/${SLUG}/`,
            messages: inboxOurs ? [ours('2-sent')] : [],
         })}</body></html>`
      }

      return `<html><body>${profileMarkup({
         messageLink,
         ...(open && {
            window: {
               title,
               messages: [...history, ...(pressed > 0 && appears ? [ours('2-sent')] : [])],
               ...(composer && {
                  composer: {
                     typed,
                     sendDisabled: typed === '' || !sendWorks,
                  },
               }),
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
      clickSelector: vi.fn(async (selector: string) => {
         if (selector === PROFILE_MESSAGE) {
            calls.push('click message')
            open = opens

            return messageLink
         }

         if (selector === WINDOW_COMPOSER) {
            calls.push('click box')

            return open && composer
         }

         if (selector === WINDOW_SEND_BUTTON) {
            calls.push('press send')
            pressed += 1
            typed = appears ? '' : typed

            return true
         }

         return false
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push('type')
         typed = typingWorks ? text : ''
      }),
      press: vi.fn(async (key: string) => {
         calls.push(`key ${key}`)

         if (key === 'Delete') {
            typed = ''
         }

         return ''
      }),
      scrollOver: vi.fn(async () => true),
      scrollBy: vi.fn(async () => true),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
      watchAnswers: vi.fn(() => ({
         statuses: () => (pressed > 0 && page.answer !== undefined ? [page.answer] : []),
         stop: vi.fn(),
      })),
   }
   const markAttempt = vi.fn(async () => !page.attempted)
   const context = {
      browser: browser as never,
      visit: vi.fn(async (url: string) => {
         at = url.includes('/messaging/') ? inboxAt : profileAt

         return at
      }),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) =>
         attached.push({
            name,
            content,
         })
      ),
      markAttempt,
   }
   const run = () =>
      sendMessage(
         context,
         BASE,
         {
            slug: SLUG,
            name: 'Ada Lovelace',
            text: TEXT,
         },
         {
            random: () => 0,
            now: () => Date.UTC(2026, 9, 29, 12),
            today: () => new Date(Date.UTC(2026, 9, 29, 12)),
         }
      )

   return {
      run,
      calls,
      attached,
      context,
      markAttempt,
   }
}

const typedNothing = (calls: string[]) => !calls.includes('type') && !calls.includes('press send')

describe('sendMessage', () => {
   it('should open the profile, press its Message, write in the window, send once, and hand over the conversation /messaging/ opens', async () => {
      const { run, calls, attached, context } = setup()

      await expect(run()).resolves.toEqual({ outcome: 'SENT' })
      expect(context.visit).toHaveBeenNthCalledWith(1, `${BASE}/in/${SLUG}/`)
      expect(calls.filter(call => call === 'press send')).toHaveLength(1)
      expect(calls.indexOf('click message')).toBeLessThan(calls.indexOf('type'))

      const [file] = attached
      const parsed = messagesFileSchema.parse(JSON.parse(file?.content ?? '{}'))

      expect(parsed.conversations[0]).toMatchObject({ id: '2-new' })
      expect(parsed.conversations[0]?.messages.at(-1)).toMatchObject({
         direction: 'ME',
         text: TEXT,
      })
   })

   it('should send in a window that already holds a conversation, and not take an earlier message with the same words as this one', async () => {
      const { run, calls } = setup({
         history: [
            {
               id: '2-old-them',
               from: 'THEM',
               name: 'Ada Lovelace',
               profile: `${BASE}/in/${SLUG}/`,
               time: '8:00 AM',
               day: 'Today',
               text: 'Hello',
            },
            ours('2-old'),
         ],
         appears: false,
      })

      // The words stay in the box and the old message of ours is not this one: not sent, never taken as sent.
      await expect(run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })
      expect(calls).toContain('press send')
   })

   it('should type nothing when the profile shows no Message link', async () => {
      const { run, calls, markAttempt } = setup({ messageLink: false })

      await expect(run()).resolves.toEqual({ outcome: 'NO_MESSAGE_BUTTON' })
      expect(typedNothing(calls)).toBe(true)
      expect(markAttempt).not.toHaveBeenCalled()
   })

   it('should type nothing when the window does not open, or opens with no box', async () => {
      for (const page of [{ opens: false }, { composer: false }]) {
         const { run, calls } = setup(page)

         await expect(run()).resolves.toEqual({ outcome: 'NO_COMPOSER' })
         expect(typedNothing(calls)).toBe(true)
      }
   })

   it('should type nothing when the window is with someone else', async () => {
      const { run, calls, markAttempt } = setup({ title: 'Grace Hopper' })

      await expect(run()).resolves.toEqual({ outcome: 'WRONG_RECIPIENT' })
      expect(typedNothing(calls)).toBe(true)
      expect(markAttempt).not.toHaveBeenCalled()
   })

   it('should say the profile is not available when the address leads elsewhere', async () => {
      const { run, calls } = setup({ profileAt: `${BASE}/feed/` })

      await expect(run()).resolves.toEqual({ outcome: 'NOT_AVAILABLE' })
      expect(typedNothing(calls)).toBe(true)
   })

   it('should answer SIGNED_OUT on a sign-in page and type nothing, and keep a send that went when a later page asks for a sign-in', async () => {
      const first = setup({ profileAt: `${BASE}/uas/login?session_redirect=x` })

      await expect(first.run()).resolves.toEqual({ outcome: 'SIGNED_OUT' })
      expect(typedNothing(first.calls)).toBe(true)

      const later = setup({ inboxAt: `${BASE}/uas/login` })

      await expect(later.run()).resolves.toEqual({ outcome: 'SENT' })
      expect(later.attached).toEqual([])
   })

   it('should type nothing for a command delivered again after it may have been sent', async () => {
      const { run, calls } = setup({ attempted: true })

      await expect(run()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(typedNothing(calls)).toBe(true)
   })

   it("should go by LinkedIn's answer when the window never shows the message, and press send only once", async () => {
      const accepted = setup({
         appears: false,
         answer: 200,
      })

      await expect(accepted.run()).resolves.toEqual({ outcome: 'SENT' })

      const refused = setup({
         appears: false,
         answer: 400,
      })

      await expect(refused.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })

      const silent = setup({ appears: false })

      await expect(silent.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })

      for (const { calls } of [accepted, refused, silent]) {
         expect(calls.filter(call => call === 'press send')).toHaveLength(1)
      }
   })

   it('should send nothing and empty the box when the words do not take or the button stays disabled', async () => {
      const typing = setup({ typingWorks: false })

      await expect(typing.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'TYPING',
      })

      const disabled = setup({ sendWorks: false })

      await expect(disabled.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_DISABLED',
      })

      for (const { calls } of [typing, disabled]) {
         expect(calls).not.toContain('press send')
         expect(calls).toContain('key Delete')
      }
   })

   it('should not hand over a conversation that is not clearly this one', async () => {
      for (const page of [{ inboxTitle: 'Grace Hopper' }, { inboxOurs: false }, { inboxAt: `${BASE}/messaging/` }]) {
         const { run, attached } = setup(page)

         await expect(run()).resolves.toEqual({ outcome: 'SENT' })
         expect(attached).toEqual([])
      }
   })
})

describe('sameName', () => {
   it('should match on the first name, without case or accents, and never on part of a word', () => {
      expect(sameName('Ada Lovelace', 'Ada Lovelace')).toBe(true)
      expect(sameName(' ÁDA  Lovelace ', 'ada lovelace')).toBe(true)
      expect(sameName('Adam Smith', 'Ada Lovelace')).toBe(false)
      expect(sameName('Ada Lovelace', '  ')).toBe(false)
   })
})

describe('answerFor', () => {
   it('should keep the session only for a message that went, and say every other answer in a fixed sentence', () => {
      const results: MessageResult[] = [
         { outcome: 'SENT' },
         { outcome: 'UNKNOWN' },
         { outcome: 'NO_MESSAGE_BUTTON' },
         { outcome: 'NO_COMPOSER' },
         { outcome: 'WRONG_RECIPIENT' },
         { outcome: 'NOT_AVAILABLE' },
         { outcome: 'SIGNED_OUT' },
         {
            outcome: 'FAILED',
            why: 'NOT_SENT',
         },
      ]

      for (const result of results) {
         const answer = answerFor(result)

         expect(answer.message).not.toMatch(/Ada|Hi /)
         expect(answer.commitSession === true).toBe(result.outcome === 'SENT')
         expect(answer.status).toBe(result.outcome === 'SENT' ? 'SUCCEEDED' : 'FAILED')
      }
   })
})
