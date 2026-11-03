import { describe, expect, it, vi } from 'vitest'

import { inmailProfileMarkup, inmailWindowMarkup } from '../../linkedin/inmailFixture'
import {
   INMAIL_COMPOSER,
   INMAIL_FILE_INPUT,
   INMAIL_IMAGE_INPUT,
   INMAIL_SEND_BUTTON,
   INMAIL_SUBJECT_BOX,
   PROFILE_MESSAGE,
} from '../../linkedin/markup'
import { threadMarkup } from '../../linkedin/messagingFixture'
import { answerFor } from './answer'
import { createLinkedinInmail } from './index'
import { type InmailInput, type InmailResult, sendInmail } from './send'

const BASE = 'https://www.linkedin.com'
const SLUG = 'ada-l'
const SUBJECT = 'A question'
const TEXT = 'Hi Ada, I saw your talk.'
const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const FILES = [
   {
      name: 'photo.png',
      kind: 'IMAGE' as const,
   },
   {
      name: 'cv.pdf',
      kind: 'FILE' as const,
   },
]

type Page = {
   profileAt?: string
   // The Message link opens a window over the profile, or leads to the whole compose page.
   layout?: 'window' | 'page'
   messageLink?: boolean
   // The window opens when the link is pressed: for a free message, or as an ordinary conversation.
   opens?: boolean
   ordinary?: boolean
   second?: boolean
   profile?: string
   banner?: string | null
   subjectBox?: boolean
   typingWorks?: boolean
   // The editor keeps only this many characters (key presses are lost), or only on the first try.
   maxChars?: number
   truncateOnce?: boolean
   // The words the conversation shows after send.
   shownText?: string
   sendWorks?: boolean
   clickFails?: boolean
   // After send: the window turns into a conversation that holds the message, or stays as it was.
   appears?: boolean
   // Whether the box is emptied by a send that did not show a message.
   clears?: boolean
   // The status LinkedIn answers the send request with once send is pressed.
   answer?: number
   // The page the window leaves the account on once the link is pressed (a sign-in page).
   leavesAt?: string
   attempted?: boolean
   // How many looks at the window, once files are attached, still find it changing; 'never' keeps it changing.
   uploadLooks?: number | 'never'
   attachWorks?: boolean
   fetchFails?: boolean
   canFetch?: boolean
}

const setup = (page: Page = {}) => {
   const { profileAt = `${BASE}/in/${SLUG}/`, messageLink = true, opens = true, appears = true } = page
   const { typingWorks = true, sendWorks = true, clears = true, attachWorks = true, canFetch = true } = page
   let at = ''
   let open = false
   let body = ''
   let hasFiles = false
   let focus: 'body' | 'subject' | 'none' = 'none'
   let uploading = page.uploadLooks ?? 0
   let changes = 0
   let pressed = 0
   let deletes = 0
   const calls: string[] = []
   const removed = vi.fn(async () => undefined)
   const html = () => {
      if (hasFiles && (uploading === 'never' || uploading > 0)) {
         changes += 1
         uploading = uploading === 'never' ? uploading : uploading - 1
      }

      if (pressed > 0 && appears && page.layout === 'page') {
         return `<html><body>${threadMarkup({
            title: 'Ada Lovelace',
            profile: `${BASE}/in/${SLUG}/`,
            messages: [
               {
                  id: 'm1',
                  from: 'ME',
                  name: 'Tripti',
                  profile: `${BASE}/in/me/`,
                  time: '9:05 AM',
                  subject: SUBJECT,
                  text: page.shownText ?? TEXT,
               },
            ],
         })}</body></html>`
      }

      if (pressed > 0 && appears) {
         return `<html><body>${inmailProfileMarkup({
            ordinary: {
               title: 'Ada Lovelace',
               messages: [
                  {
                     id: 'm1',
                     from: 'ME',
                     name: 'Tripti',
                     time: '9:05 AM',
                     day: 'Today',
                     subject: SUBJECT,
                     text: page.shownText ?? TEXT,
                  },
               ],
            },
         })}</body></html>`
      }

      if (!open) {
         return `<html><body>${inmailProfileMarkup({ messageLink })}</body></html>`
      }

      const composer = {
         typed: body,
         sendDisabled: (body === '' && !hasFiles) || !sendWorks,
         ...(hasFiles && { extra: `<div class="chip" data-n="${changes}">file</div>` }),
      }

      if (page.layout === 'page') {
         return `<html><body>${inmailWindowMarkup({
            layout: 'page',
            profile: page.profile ?? `/in/${SLUG}/`,
            ...(page.banner !== undefined && { banner: page.banner }),
            subject: page.subjectBox ?? true,
            composer,
         })}</body></html>`
      }

      return `<html><body>${inmailProfileMarkup({
         messageLink,
         ...(page.ordinary
            ? { ordinary: { title: 'Ada Lovelace' } }
            : {
                 inmail: {
                    profile: page.profile ?? `/in/${SLUG}/`,
                    ...(page.banner !== undefined && { banner: page.banner }),
                    subject: page.subjectBox ?? true,
                    composer,
                 },
              }),
         ...(page.second && { extraWindow: { profile: '/in/other/' } }),
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
            at = page.leavesAt ?? at

            return messageLink
         }

         if (selector === INMAIL_COMPOSER) {
            calls.push('click body')
            focus = 'body'

            return open
         }

         if (selector === INMAIL_SUBJECT_BOX) {
            calls.push('click subject')
            focus = 'subject'

            return open && (page.subjectBox ?? true)
         }

         if (selector === INMAIL_SEND_BUTTON) {
            calls.push('press send')

            if (page.clickFails || (body === '' && !hasFiles) || !sendWorks) {
               return false
            }

            pressed += 1
            hasFiles = false

            if (appears || clears) {
               body = ''
            }

            return true
         }

         return false
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push(`type ${focus}`)

         if (focus === 'body' && typingWorks) {
            const limit = page.truncateOnce && deletes === 0 ? 10 : (page.maxChars ?? Infinity)

            body += text.slice(0, Math.max(0, limit - body.length))
         }
      }),
      attachFiles: vi.fn(async (selector: string, paths: string[]) => {
         calls.push(
            `attach ${selector === INMAIL_IMAGE_INPUT ? 'images' : selector === INMAIL_FILE_INPUT ? 'files' : 'other'} ${paths.length}`
         )
         hasFiles = attachWorks

         return attachWorks
      }),
      press: vi.fn(async (key: string) => {
         calls.push(`key ${key}`)

         if (key === 'Delete') {
            deletes += 1
            body = ''
         }

         return ''
      }),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
      scrollOver: vi.fn(async () => true),
      scrollBy: vi.fn(async () => true),
      watchAnswers: vi.fn((_method: string, _parts: string[]) => ({
         statuses: () => (pressed > 0 && page.answer !== undefined ? [page.answer] : []),
         stop: vi.fn(),
      })),
   }
   const uploads = {
      fetch: vi.fn(async (_uploadId: string, names: string[]) => {
         if (page.fetchFails) {
            throw new Error('gone')
         }

         return {
            paths: names.map(name => `/tmp/up/${name}`),
            remove: removed,
         }
      }),
   }
   const context = {
      browser: browser as never,
      visit: vi.fn(async () => {
         at = profileAt

         return at
      }),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      markAttempt: vi.fn(async () => !page.attempted),
      ...(canFetch && { uploads }),
   }
   const run = (input: Partial<InmailInput> = {}) =>
      sendInmail(
         context as never,
         BASE,
         {
            slug: SLUG,
            subject: '',
            text: TEXT,
            files: [],
            ...input,
         },
         {
            random: () => 0.5,
            now: () => Date.UTC(2026, 10, 3, 12),
            today: () => new Date(Date.UTC(2026, 10, 3, 12)),
         }
      )

   return {
      run,
      calls,
      context,
      removed,
      uploads,
   }
}

const typedNothing = (calls: string[]) => !calls.some(call => call.startsWith('type') || call === 'press send')

describe('sendInmail', () => {
   it('should open the profile, press Message, write in the window for a free message, send once, and see the conversation it turns into', async () => {
      const { run, calls, context } = setup()

      await expect(run()).resolves.toEqual({ outcome: 'SENT' })
      expect(context.visit).toHaveBeenCalledWith(`${BASE}/in/${SLUG}/`)
      expect(calls).toEqual(['click message', 'click body', 'type body', 'press send'])
      expect(context.markAttempt).toHaveBeenCalledTimes(1)
   })

   it('should write and send the same on the whole compose page the Message link can lead to, and see the conversation page it turns into', async () => {
      const { run, calls } = setup({ layout: 'page' })

      await expect(run({ subject: SUBJECT })).resolves.toEqual({ outcome: 'SENT' })
      expect(calls.filter(call => call === 'press send')).toHaveLength(1)
      await expect(
         setup({
            layout: 'page',
            banner: null,
         }).run()
      ).resolves.toEqual({ outcome: 'WOULD_COST_CREDIT' })
      await expect(
         setup({
            layout: 'page',
            profile: '/in/grace-h/',
         }).run()
      ).resolves.toEqual({ outcome: 'WRONG_RECIPIENT' })
   })

   it('should type long words in pieces, and send them whole', async () => {
      const text = 'We help teams like yours book more calls with the right people, and we would like to talk about it.'
      const { run, calls } = setup({ shownText: text })

      await expect(run({ text })).resolves.toEqual({ outcome: 'SENT' })
      expect(calls.filter(call => call === 'type body').length).toBeGreaterThan(3)
      expect(calls.filter(call => call === 'press send')).toHaveLength(1)
   })

   it('should empty the box and type the words again when key presses were lost, and send only the whole words', async () => {
      const text = 'We help teams like yours book more calls with the right people.'
      const { run, calls } = setup({
         truncateOnce: true,
         shownText: text,
      })

      await expect(run({ text })).resolves.toEqual({ outcome: 'SENT' })
      expect(calls).toContain('key Delete')
      expect(calls.filter(call => call === 'press send')).toHaveLength(1)
   })

   it('should send nothing when the box never holds the words', async () => {
      const { run, calls } = setup({ maxChars: 10 })

      await expect(run({ text: 'We help teams like yours book more calls with the right people.' })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'TYPING',
      })
      expect(calls).not.toContain('press send')
   })

   it('should say the words differ when LinkedIn says it went and the conversation shows other words', async () => {
      const { run } = setup({
         shownText: 'We help teams like',
         answer: 200,
      })

      await expect(run()).resolves.toEqual({ outcome: 'DIFFERENT_WORDS' })
   })

   it('should type the subject in its own box before the words', async () => {
      const { run, calls } = setup()

      await expect(run({ subject: SUBJECT })).resolves.toEqual({ outcome: 'SENT' })
      expect(calls).toEqual([
         'click message',
         'click body',
         'click subject',
         'type subject',
         'click body',
         'type body',
         'press send',
      ])
   })

   it('should attach images and other files first, wait for them to upload, and send them with the words', async () => {
      const { run, calls, uploads } = setup({ uploadLooks: 4 })

      await expect(
         run({
            subject: SUBJECT,
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({ outcome: 'SENT' })
      expect(uploads.fetch).toHaveBeenCalledWith(UPLOAD, ['photo.png', 'cv.pdf'])
      expect(calls).toEqual([
         'click message',
         'click body',
         'attach images 1',
         'attach files 1',
         'click subject',
         'type subject',
         'click body',
         'type body',
         'press send',
      ])
   })

   it('should send files alone, typing no words, and remove the fetched files whatever happened', async () => {
      const sent = setup()
      const stuck = setup({ uploadLooks: 'never' })
      const only = {
         text: '',
         files: FILES.slice(1),
         uploadId: UPLOAD,
      }

      await expect(sent.run(only)).resolves.toEqual({ outcome: 'SENT' })
      expect(sent.calls).toEqual(['click message', 'click body', 'attach files 1', 'press send'])
      await expect(stuck.run(only)).resolves.toEqual({
         outcome: 'FAILED',
         why: 'UPLOAD',
      })
      expect(stuck.calls).not.toContain('press send')
      expect(sent.removed).toHaveBeenCalledTimes(1)
      expect(stuck.removed).toHaveBeenCalledTimes(1)
   })

   it('should say why files could not be given, and press nothing', async () => {
      const files = {
         files: FILES,
         uploadId: UPLOAD,
      }
      const refused = setup({ attachWorks: false })

      await expect(refused.run(files)).resolves.toEqual({
         outcome: 'FAILED',
         why: 'ATTACH',
      })

      for (const page of [{ fetchFails: true }, { canFetch: false }]) {
         await expect(setup(page).run(files)).resolves.toEqual({
            outcome: 'FAILED',
            why: 'NO_FILES',
         })
      }

      await expect(setup().run({ files: FILES })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      expect(typedNothing(refused.calls)).toBe(true)
   })

   it('should type nothing when the profile shows no Message link, or the address is not a profile', async () => {
      const none = setup({ messageLink: false })
      const gone = setup({ profileAt: `${BASE}/feed/` })

      await expect(none.run()).resolves.toEqual({ outcome: 'NO_MESSAGE_BUTTON' })
      await expect(gone.run()).resolves.toEqual({ outcome: 'NOT_AVAILABLE' })
      expect(typedNothing(none.calls)).toBe(true)
      expect(none.context.markAttempt).not.toHaveBeenCalled()
   })

   it('should type nothing when the window does not open, opens as an ordinary conversation, or more than one is open', async () => {
      const cases: Array<[Page, InmailResult['outcome']]> = [
         [{ opens: false }, 'NO_COMPOSER'],
         [{ ordinary: true }, 'NOT_INMAIL'],
         [{ second: true }, 'WRONG_RECIPIENT'],
         [{ profile: '/in/grace-h/' }, 'WRONG_RECIPIENT'],
      ]

      for (const [page, outcome] of cases) {
         const { run, calls, context } = setup(page)

         await expect(run()).resolves.toEqual({ outcome })
         expect(typedNothing(calls)).toBe(true)
         expect(context.markAttempt).not.toHaveBeenCalled()
      }
   })

   it('should type nothing, and start no attempt, when the window does not say the message is free', async () => {
      // The banner for a credit was never seen; "3 InMail credits" is made up.
      for (const banner of ['3 InMail credits |', null]) {
         const { run, calls, context } = setup({ banner })

         await expect(run()).resolves.toEqual({ outcome: 'WOULD_COST_CREDIT' })
         expect(typedNothing(calls)).toBe(true)
         expect(context.markAttempt).not.toHaveBeenCalled()
      }
   })

   it('should say signed out when LinkedIn shows a sign-in page, on the profile or after the link was pressed', async () => {
      for (const page of [{ profileAt: `${BASE}/uas/login` }, { leavesAt: `${BASE}/authwall` }]) {
         const { run, calls } = setup(page)

         await expect(run()).resolves.toEqual({ outcome: 'SIGNED_OUT' })
         expect(typedNothing(calls)).toBe(true)
      }
   })

   it('should start nothing when the command was delivered before', async () => {
      const { run, calls } = setup({ attempted: true })

      await expect(run()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(typedNothing(calls)).toBe(true)
   })

   it('should say what could not be done before send, and empty the box', async () => {
      const typing = setup({ typingWorks: false })
      const subject = setup({ subjectBox: false })
      const disabled = setup({ sendWorks: false })
      const pressing = setup({ clickFails: true })

      await expect(typing.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'TYPING',
      })
      await expect(subject.run({ subject: SUBJECT })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SUBJECT',
      })
      await expect(disabled.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_DISABLED',
      })
      await expect(pressing.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_NOT_CLICKED',
      })
      expect(typing.calls).toContain('key Delete')
      expect(typing.calls).not.toContain('press send')
      expect(disabled.calls).not.toContain('press send')
   })

   it('should press send once, and say not sent when the words stay in the box, UNKNOWN when the box emptied and nothing showed', async () => {
      const stays = setup({
         appears: false,
         clears: false,
      })
      const quiet = setup({ appears: false })

      await expect(stays.run()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })
      await expect(quiet.run()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(stays.calls.filter(call => call === 'press send')).toHaveLength(1)
      expect(quiet.calls.filter(call => call === 'press send')).toHaveLength(1)
   })

   it('should go by LinkedIn answer to the send request when the page never shows the message', async () => {
      await expect(
         setup({
            appears: false,
            answer: 200,
         }).run()
      ).resolves.toEqual({ outcome: 'SENT' })
      await expect(
         setup({
            appears: false,
            answer: 422,
         }).run()
      ).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NOT_SENT',
      })
   })
})

describe('answerFor', () => {
   const results: InmailResult[] = [
      { outcome: 'SENT' },
      { outcome: 'UNKNOWN' },
      { outcome: 'NO_MESSAGE_BUTTON' },
      { outcome: 'NOT_INMAIL' },
      { outcome: 'WOULD_COST_CREDIT' },
      { outcome: 'NO_COMPOSER' },
      { outcome: 'WRONG_RECIPIENT' },
      { outcome: 'DIFFERENT_WORDS' },
      { outcome: 'NOT_AVAILABLE' },
      { outcome: 'SIGNED_OUT' },
      ...(
         ['TYPING', 'SUBJECT', 'NO_FILES', 'ATTACH', 'UPLOAD', 'SEND_DISABLED', 'SEND_NOT_CLICKED', 'NOT_SENT'] as const
      ).map(why => ({
         outcome: 'FAILED' as const,
         why,
      })),
   ]
   const task = createLinkedinInmail({ baseUrl: BASE })

   it('should answer with a verdict the task declares, a fixed sentence, and a kept session only when sent', () => {
      for (const result of results) {
         const answer = answerFor(result)

         expect(Object.keys(task.verdicts)).toContain(answer.verdict)
         expect(answer.message).toMatch(/\.$/)
         expect('commitSession' in answer).toBe(result.outcome === 'SENT')
      }
   })

   it('should declare every verdict a run can end in, and the pause the owner chose', () => {
      expect(Object.keys(task.verdicts).sort()).toEqual(
         [...new Set([...results.map(({ outcome }) => outcome), 'ERROR'])].sort()
      )
      expect(task.policy).toEqual({
         cooldownMs: 120_000,
         oneAtATime: 'account',
      })
   })

   it('should take words or files, files only with their upload, and keep the limits', () => {
      const parse = (input: unknown) => task.input.safeParse(input).success
      const file = { files: FILES }

      expect(
         parse({
            slug: SLUG,
            text: TEXT,
         })
      ).toBe(true)
      expect(
         parse({
            slug: SLUG,
            subject: 'x'.repeat(200),
            text: 'x'.repeat(1900),
         })
      ).toBe(true)
      expect(parse({ slug: SLUG })).toBe(false)
      expect(
         parse({
            slug: SLUG,
            subject: 'x'.repeat(201),
            text: TEXT,
         })
      ).toBe(false)
      expect(
         parse({
            slug: SLUG,
            text: 'x'.repeat(1901),
         })
      ).toBe(false)
      expect(
         parse({
            slug: SLUG,
            ...file,
         })
      ).toBe(false)
      expect(
         parse({
            slug: SLUG,
            ...file,
            uploadId: UPLOAD,
         })
      ).toBe(true)
      expect(
         parse({
            slug: SLUG,
            text: TEXT,
            name: 'Ada',
         })
      ).toBe(false)
   })
})
