import { describe, expect, it, vi } from 'vitest'

import { messagesFileSchema } from '@automatedLinkedIn/contracts'

import { COMPOSER, FILE_INPUT, IMAGE_INPUT, SEND_BUTTON } from '../../linkedin/markup'
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
   // How many looks at the page find it still empty, as through a slow proxy.
   slowPage?: number
   // How many looks, once the words are typed, still find the send button disabled.
   enableAfter?: number
   // The send button is enabled but a click on it does not land (it is out of view or covered).
   clickFails?: boolean
   // How many scrolls it takes to bring the send button into view; a click before that finds nothing to press.
   hidden?: number
   // How many looks at the box, once files are attached, still find it changing (an upload going on); 'never' keeps it changing.
   uploadLooks?: number | 'never'
   // The page takes the files, and the task is able to fetch them.
   attachWorks?: boolean
   fetchFails?: boolean
   canFetch?: boolean
   // A message of ours with the same words is already the newest of the page.
   alreadyThere?: boolean
}

const setup = (page: Page = {}) => {
   const { at = `${BASE}/messaging/thread/${THREAD}/`, title = 'Ada Lovelace', composer = true } = page
   const { sendWorks = true, typingWorks = true, appears = 'now', clears = true, clickFails = false } = page
   const { attachWorks = true, fetchFails = false, canFetch = true, alreadyThere = false } = page
   const removed = vi.fn(async () => undefined)
   let waiting = page.slowPage ?? 0
   let scrolled = 0
   let hasFiles = false
   let uploading = page.uploadLooks ?? 0
   let changes = 0
   let disabledReads = page.enableAfter ?? 0
   let focused = false
   let typed = ''
   let pressed = false
   let looks = 0
   let shown = false
   const sentTexts: string[] = []
   const attached: Record<string, string> = {}
   const calls: string[] = []
   const html = () => {
      if (waiting > 0) {
         waiting -= 1

         return '<html><body></body></html>'
      }

      const stillDisabled = typed !== '' && disabledReads > 0

      if (stillDisabled) {
         disabledReads -= 1
      }

      if (pressed && appears === 'late') {
         looks += 1
         shown = looks >= 3
      }

      if (hasFiles && (uploading === 'never' || uploading > 0)) {
         changes += 1
         uploading = uploading === 'never' ? uploading : uploading - 1
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
            ...(alreadyThere
               ? [
                    {
                       id: 'z',
                       from: 'ME' as const,
                       name: 'Tripti Verma',
                       profile: `${BASE}/in/me/`,
                       time: '8:55 AM',
                       text: TEXT,
                    },
                 ]
               : []),
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
               sendDisabled: (typed === '' && !hasFiles) || !sendWorks || stillDisabled,
               ...(hasFiles && { extra: `<div class="chip" data-n="${changes}">file</div>` }),
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
      scrollOver: vi.fn(async (selector: string) => {
         calls.push(`scroll ${selector === COMPOSER ? 'composer' : 'other'}`)
         scrolled += 1

         return true
      }),
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
            if (scrolled < (page.hidden ?? 0)) {
               return false
            }

            calls.push('click send')

            if ((typed === '' && !hasFiles) || !sendWorks || clickFails) {
               return false
            }

            pressed = true
            sentTexts.push(typed)
            hasFiles = false

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
      attachFiles: vi.fn(async (selector: string, paths: string[]) => {
         calls.push(
            `attach ${selector === IMAGE_INPUT ? 'images' : selector === FILE_INPUT ? 'files' : 'other'} ${paths.length}`
         )
         hasFiles = attachWorks

         return attachWorks
      }),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => at),
   }
   const uploads = {
      fetch: vi.fn(async (_uploadId: string, names: string[]) => {
         if (fetchFails) {
            throw new Error('gone')
         }

         return {
            paths: names.map(name => `/tmp/up/${name}`),
            remove: removed,
         }
      }),
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
      ...(canFetch && { uploads }),
   }

   return {
      context,
      browser,
      calls,
      sentTexts,
      attached,
      uploads,
      removed,
      send: (input: Partial<Parameters<typeof sendReply>[2]> = {}) =>
         sendReply(
            context as never,
            BASE,
            {
               thread: THREAD,
               text: TEXT,
               title: 'Ada Lovelace',
               files: [],
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
   const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

   it('should attach images and other files first, wait for them to upload, type the words, and send them together', async () => {
      const { send, calls, uploads } = setup({ uploadLooks: 4 })

      await expect(
         send({
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({ outcome: 'SENT' })

      expect(uploads.fetch).toHaveBeenCalledWith(UPLOAD, ['photo.png', 'cv.pdf'])
      expect(calls).toEqual([
         'click composer',
         'attach images 1',
         'attach files 1',
         'click composer',
         'type',
         'click send',
      ])
   })

   it('should send files alone, with no words typed, when there are no words', async () => {
      const { send, calls } = setup()

      await expect(
         send({
            text: '',
            files: FILES.slice(1),
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({ outcome: 'SENT' })
      expect(calls).not.toContain('type')
      expect(calls).toContain('attach files 1')
      expect(calls).toContain('click send')
   })

   it('should remove the fetched files whatever happened', async () => {
      const sent = setup()
      const failed = setup({ uploadLooks: 'never' })

      await sent.send({
         files: FILES,
         uploadId: UPLOAD,
      })
      await failed.send({
         files: FILES,
         uploadId: UPLOAD,
      })

      expect(sent.removed).toHaveBeenCalledTimes(1)
      expect(failed.removed).toHaveBeenCalledTimes(1)
   })

   it('should say the files did not finish uploading, press nothing, and empty the box, when the box never stops changing', async () => {
      const { send, calls } = setup({ uploadLooks: 'never' })

      await expect(
         send({
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({
         outcome: 'FAILED',
         why: 'UPLOAD',
      })
      expect(calls).not.toContain('click send')
      expect(calls).not.toContain('type')
      expect(calls).toContain('press Delete')
   })

   it('should say there is no place to attach files when the page does not take them', async () => {
      const { send, calls } = setup({ attachWorks: false })

      await expect(
         send({
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({
         outcome: 'FAILED',
         why: 'ATTACH',
      })
      expect(calls).not.toContain('type')
   })

   it('should say the files could not be fetched when they cannot, without typing anything', async () => {
      const gone = setup({ fetchFails: true })
      const unsupported = setup({ canFetch: false })
      const unknown = setup()

      await expect(
         gone.send({
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      await expect(
         unsupported.send({
            files: FILES,
            uploadId: UPLOAD,
         })
      ).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      await expect(unknown.send({ files: FILES })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      expect(gone.calls).not.toContain('type')
      expect(unsupported.calls).not.toContain('type')
   })

   it('should not take a message of ours that was already the newest with the same words for the one just sent', async () => {
      const { send } = setup({
         alreadyThere: true,
         appears: 'never',
      })

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
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

   it('should wait for a page that is still drawing, not take it for one with no box', async () => {
      const { send } = setup({ slowPage: 6 })

      await expect(send()).resolves.toEqual({ outcome: 'SENT' })
   })

   it('should wait for a send button that comes alive a moment after the words are typed', async () => {
      const { send } = setup({ enableAfter: 4 })

      await expect(send()).resolves.toEqual({ outcome: 'SENT' })
   })

   it('should scroll the page a little over the box until the send button is in view, then press it once', async () => {
      const { send, calls } = setup({ hidden: 2 })

      await expect(send()).resolves.toEqual({ outcome: 'SENT' })
      expect(calls.filter(call => call === 'scroll composer')).toHaveLength(2)
      expect(calls.filter(call => call === 'click send')).toHaveLength(1)
   })

   it('should give up scrolling after a few tries when the send button never comes into view, and empty the box', async () => {
      const { send, calls } = setup({ hidden: 99 })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_NOT_CLICKED',
      })
      expect(calls.filter(call => call === 'scroll composer')).toHaveLength(4)
      expect(calls).not.toContain('click send')
      expect(calls).toContain('press Delete')
   })

   it('should say the send button could not be clicked when it is enabled but the click does not land, and empty the box', async () => {
      const { send, calls } = setup({ clickFails: true })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'SEND_NOT_CLICKED',
      })
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
