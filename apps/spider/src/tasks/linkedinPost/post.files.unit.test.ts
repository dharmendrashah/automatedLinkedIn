import { describe, expect, it, vi } from 'vitest'

import {
   POST_BUTTON,
   POST_DIALOG_BUTTON,
   POST_DOCUMENT_DONE,
   POST_DOCUMENT_INPUT,
   POST_DOCUMENT_LINK,
   POST_DOCUMENT_TITLE,
   POST_EDITOR,
   POST_MEDIA_BUTTON,
   POST_MORE_TYPES,
   POST_PHOTO_INPUT,
   POST_VIDEO_INPUT,
} from '../../linkedin/markup'
import { parseDocumentDialog, parseEditorDialog, parsePostComposer } from '../../linkedin/postComposer'
import { composerMarkup, postedMarkup } from '../../linkedin/postFixture'
import { documentMarkup, editorMarkup } from '../../linkedin/postMediaFixture'
import { type PostInput, sendPost } from './post'

const BASE = 'https://www.linkedin.com'
const ACTIVITY = `${BASE}/feed/update/urn:li:activity:7520195721216827392/`
const ID_A = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const ID_B = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b35'

type Page = {
   // How many looks at the dialog still find the upload going on (Next or Done greyed); 'never' keeps it going.
   uploadLooks?: number | 'never'
   // LinkedIn refuses the file.
   refused?: boolean
   // The dialog never offers its file input.
   noInput?: boolean
   // The files cannot be fetched, or the task is given no way to fetch them.
   fetchFails?: boolean
   canFetch?: boolean
   // The layout whose buttons have no data-view-name: Post and Done are pressed by their place among the dialog buttons.
   plain?: boolean
   // The dialog draws no file input at all: its Choose file or Upload from computer button opens a file chooser (staging, 2026-10-27).
   chooserOnly?: boolean
}

const setup = (page: Page = {}) => {
   const { refused = false, noInput = false, fetchFails = false, canFetch = true } = page
   let dialog: 'editor' | 'document' | undefined
   let chosen = false
   let uploading = page.uploadLooks ?? 0
   let attached = false
   let focus: 'box' | 'title' | undefined
   let typed: string[] = []
   let pressed = false
   const calls: string[] = []
   const titles: string[] = []
   const html = () => {
      if (pressed) {
         return postedMarkup({ toast: ACTIVITY })
      }

      if (dialog === 'editor') {
         const waiting = chosen && (uploading === 'never' || uploading > 0)

         if (waiting && uploading !== 'never') {
            uploading -= 1
         }

         return editorMarkup({
            nextDisabled: !chosen || waiting,
            refused: chosen && refused,
         })
      }

      if (dialog === 'document') {
         const waiting = chosen && (uploading === 'never' || uploading > 0)

         if (waiting && uploading !== 'never') {
            uploading -= 1
         }

         return documentMarkup({
            chosen,
            doneDisabled: waiting,
            refused: chosen && refused,
            plain: page.plain ?? false,
         })
      }

      return composerMarkup({
         typed,
         audience: 'Anyone',
         comments: 'Anyone',
         attached,
         disabled: typed.length === 0 && !attached,
         plain: page.plain ?? false,
      })
   }
   const browser = {
      pageHtml: vi.fn(async () => html()),
      inspect: vi.fn(async () => ({
         url: `${BASE}/sharing/compose`,
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
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => `${BASE}/sharing/compose`),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => `${BASE}/sharing/compose`),
      scrollBy: vi.fn(async () => true),
      press: vi.fn(async (key: string) => {
         calls.push(`press ${key}`)

         return ''
      }),
      attachFiles: vi.fn(async (selector: string, paths: string[]) => {
         const wanted = dialog === 'document' ? POST_DOCUMENT_INPUT : [POST_PHOTO_INPUT, POST_VIDEO_INPUT]

         if (!dialog || noInput || page.chooserOnly || ![wanted].flat().includes(selector)) {
            return false
         }

         calls.push(
            `give ${selector === POST_PHOTO_INPUT ? 'photos' : selector === POST_VIDEO_INPUT ? 'video' : 'document'} ${paths.length}`
         )
         chosen = true

         return true
      }),
      chooseFiles: vi.fn(async (selector: string, index: number, paths: string[]) => {
         if (selector !== POST_DIALOG_BUTTON || !dialog || noInput) {
            return false
         }

         const wanted =
            dialog === 'document'
               ? parseDocumentDialog(
                    documentMarkup({
                       chosen,
                       plain: page.plain ?? false,
                    })
                 ).chooseIndex
               : parseEditorDialog(editorMarkup({ nextDisabled: true })).chooseIndex

         if (wanted !== index) {
            return false
         }

         calls.push(`choose ${dialog === 'document' ? 'document' : 'photos'} ${paths.length}`)
         chosen = true

         return true
      }),
      clickNth: vi.fn(async (selector: string, index: number) => {
         if (selector !== POST_DIALOG_BUTTON) {
            return false
         }

         if (dialog === 'editor') {
            calls.push(`click button ${index}`)
            dialog = undefined
            attached = true

            return true
         }

         if (dialog === 'document' && page.plain) {
            if (
               parseDocumentDialog(
                  documentMarkup({
                     chosen,
                     plain: true,
                  })
               ).doneIndex !== index
            ) {
               return false
            }

            calls.push('click done')
            dialog = undefined
            attached = true

            return true
         }

         if (!dialog && page.plain) {
            if (
               parsePostComposer(
                  composerMarkup({
                     typed,
                     attached,
                     plain: true,
                  })
               ).postIndex !== index
            ) {
               return false
            }

            calls.push('click post')
            pressed = true

            return true
         }

         return false
      }),
      clickSelector: vi.fn(async (selector: string) => {
         if (selector === POST_MEDIA_BUTTON) {
            calls.push('open media')
            dialog = 'editor'
            chosen = false

            return true
         }

         if (selector === POST_MORE_TYPES) {
            calls.push('expand types')

            return true
         }

         if (selector === POST_DOCUMENT_LINK) {
            calls.push('open document')
            dialog = 'document'
            chosen = false

            return true
         }

         if (selector === POST_DOCUMENT_TITLE) {
            focus = 'title'

            return true
         }

         if (selector === POST_DOCUMENT_DONE) {
            if (page.plain) {
               return false
            }

            calls.push('click done')
            dialog = undefined
            attached = true

            return true
         }

         if (selector === POST_EDITOR) {
            calls.push('click box')
            focus = 'box'

            return true
         }

         if (selector === POST_BUTTON) {
            if (page.plain) {
               return false
            }

            calls.push('click post')
            pressed = true

            return true
         }

         return false
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push(`type ${focus}`)

         if (focus === 'title') {
            titles.push(text)
         } else {
            typed = text.split('\n').filter(line => line !== '')
         }
      }),
   }
   const remove = vi.fn(async () => undefined)
   const fetch = vi.fn(async (files: Array<{ id: string; name: string }>) => {
      if (fetchFails) {
         throw new Error('gone')
      }

      return {
         paths: files.map(({ name }) => `/tmp/up/${name}`),
         remove,
      }
   })
   const context = {
      browser,
      visit: vi.fn(async (_url: string) => `${BASE}/sharing/compose`),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn(),
      markAttempt: vi.fn(async () => true),
      ...(canFetch && { postFiles: { fetch } }),
   }

   return {
      context,
      calls,
      titles,
      fetch,
      remove,
      send: (input: Partial<PostInput> = {}) =>
         sendPost(
            context as never,
            BASE,
            {
               text: 'Here it is.',
               files: [],
               audience: 'ANYONE',
               comments: 'ANYONE',
               ...input,
            },
            {
               random: () => 0.5,
               now: () => 0,
            }
         ),
   }
}

const photos = [
   {
      id: ID_A,
      name: 'a.jpg',
      kind: 'PHOTOS' as const,
   },
   {
      id: ID_B,
      name: 'b.png',
      kind: 'PHOTOS' as const,
   },
]
const video = [
   {
      id: ID_A,
      name: 'clip.mp4',
      kind: 'VIDEO' as const,
   },
]
const document = [
   {
      id: ID_A,
      name: 'Annual_report-2026.pdf',
      kind: 'DOCUMENT' as const,
   },
]

describe('sendPost with files', () => {
   it('should fetch the photos, give them to the media dialog, press Next once they are up, then type the words and post', async () => {
      const { send, calls, fetch, remove } = setup()

      await expect(send({ files: photos })).resolves.toEqual({
         outcome: 'POSTED',
         link: ACTIVITY,
      })
      expect(fetch).toHaveBeenCalledWith([
         {
            id: ID_A,
            name: 'a.jpg',
         },
         {
            id: ID_B,
            name: 'b.png',
         },
      ])
      expect(calls).toEqual(['open media', 'give photos 2', 'click button 4', 'click box', 'type box', 'click post'])
      expect(remove).toHaveBeenCalledTimes(1)
   })

   it('should post photos on the layout with no data-view-names, knowing the photos are on from the Post button coming alive', async () => {
      const { send, calls } = setup({ plain: true })

      await expect(send({ files: photos })).resolves.toEqual({
         outcome: 'POSTED',
         link: ACTIVITY,
      })
      expect(calls).toEqual(['open media', 'give photos 2', 'click button 4', 'click box', 'type box', 'click post'])
   })

   it('should post a document on that layout, pressing Done by its words and Post by its place', async () => {
      const { send, calls } = setup({
         plain: true,
         uploadLooks: 2,
      })

      await expect(send({ files: document })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual([
         'expand types',
         'open document',
         'give document 1',
         'press ControlOrMeta+A',
         'type title',
         'click done',
         'click box',
         'type box',
         'click post',
      ])
   })

   it('should give a document through the file chooser of its Choose file button when the dialog draws no file input', async () => {
      const { send, calls } = setup({
         plain: true,
         chooserOnly: true,
      })

      await expect(send({ files: document })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls.slice(0, 3)).toEqual(['expand types', 'open document', 'choose document 1'])
      expect(calls).toContain('click done')
   })

   it('should give photos through the file chooser of its Upload from computer button when the dialog draws no file input', async () => {
      const { send, calls } = setup({
         plain: true,
         chooserOnly: true,
      })

      await expect(send({ files: photos })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls.slice(0, 3)).toEqual(['open media', 'choose photos 2', 'click button 4'])
   })

   it('should give a video to the input that takes videos', async () => {
      const { send, calls } = setup()

      await expect(send({ files: video })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls.slice(0, 3)).toEqual(['open media', 'give video 1', 'click button 4'])
   })

   it('should wait while LinkedIn keeps Next greyed for an upload that is not finished', async () => {
      const { send, calls } = setup({ uploadLooks: 5 })

      await expect(send({ files: photos })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls.filter(call => call.startsWith('click button'))).toHaveLength(1)
   })

   it('should post a document through its own dialog, with a title made from its name, then type the words', async () => {
      const { send, calls, titles } = setup({ uploadLooks: 2 })

      await expect(send({ files: document })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual([
         'expand types',
         'open document',
         'give document 1',
         'press ControlOrMeta+A',
         'type title',
         'click done',
         'click box',
         'type box',
         'click post',
      ])
      expect(titles).toEqual(['Annual report 2026'])
   })

   it('should post files alone when there are no words, typing nothing in the box', async () => {
      const { send, calls } = setup()

      await expect(
         send({
            files: photos,
            text: '',
         })
      ).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).not.toContain('type box')
      expect(calls).toContain('click post')
   })

   it('should say LinkedIn refused the file, post nothing, type nothing, and remove the files', async () => {
      const { send, calls, remove } = setup({ refused: true })

      await expect(send({ files: photos })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'FILE_REFUSED',
      })
      expect(calls).not.toContain('click post')
      expect(calls).not.toContain('type box')
      expect(remove).toHaveBeenCalledTimes(1)
   })

   it('should say the upload did not finish, and post nothing, when Next stays greyed', async () => {
      const { send, calls } = setup({ uploadLooks: 'never' })

      await expect(send({ files: photos })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'UPLOAD',
      })
      expect(calls).not.toContain('click post')
   })

   it('should say the page took no file when the dialog never offers its input', async () => {
      const { send, calls } = setup({ noInput: true })

      await expect(send({ files: photos })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'ATTACH',
      })
      expect(calls).not.toContain('click post')
   })

   it('should say the files could not be fetched, and type nothing, when they cannot', async () => {
      const failing = setup({ fetchFails: true })
      const without = setup({ canFetch: false })

      await expect(failing.send({ files: photos })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      await expect(without.send({ files: photos })).resolves.toEqual({
         outcome: 'FAILED',
         why: 'NO_FILES',
      })
      expect(failing.calls).toEqual([])
      expect(without.calls).toEqual([])
   })

   it('should fetch nothing and open nothing when this post was started before', async () => {
      const { send, calls, fetch, context } = setup()

      context.markAttempt.mockResolvedValue(false)

      await expect(send({ files: photos })).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(fetch).not.toHaveBeenCalled()
      expect(calls).toEqual([])
   })

   it('should not fetch anything for a post of words only', async () => {
      const { send, fetch } = setup()

      await send()

      expect(fetch).not.toHaveBeenCalled()
   })
})
