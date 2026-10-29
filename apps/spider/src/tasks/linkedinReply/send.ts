import { type ReplyFile } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { COMPOSER, FILE_INPUT, IMAGE_INPUT, MESSAGING_PATH, SEND_BUTTON, THREAD_ID } from '../../linkedin/markup'
import { BOX_PAUSES, SEND_REQUEST, createMessageBox, handOverPage } from '../../linkedin/messageBox'
import { composerHtml, parseComposer, parseThread } from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type AnswerWatch } from '../../scraping/driver'
import { type TaskContext } from '../defineTask'
import { type Fetched } from '../uploads'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt' | 'uploads'>

export type ReplyInput = {
   // The id of the conversation in the address of its page, and its name as the page shows it (empty: not checked).
   thread: string
   title: string
   // May be empty when there are files.
   text: string
   // The files to attach, by the names they have in the upload.
   files: ReplyFile[]
   uploadId?: string
}

// SENT: the message shows as the newest of the account. UNKNOWN: send was pressed and the page does not show it, so it may
// or may not have gone (nothing is typed again for it). FAILED: nothing was sent. NO_COMPOSER: the page offers no place to
// write. WRONG_THREAD: the page is on another conversation. SIGNED_OUT: LinkedIn asked for a sign-in.
export type ReplyResult =
   | { outcome: 'SENT' | 'UNKNOWN' | 'NO_COMPOSER' | 'WRONG_THREAD' | 'SIGNED_OUT' }
   | {
        outcome: 'FAILED'
        why: 'TYPING' | 'NO_FILES' | 'ATTACH' | 'UPLOAD' | 'SEND_DISABLED' | 'SEND_NOT_CLICKED' | 'NOT_SENT'
     }

type Deps = {
   random?: () => number
   now?: () => number
   today?: () => Date
}

// How many times the page is looked at for its conversation and box: through a slow proxy the page can take half a minute to draw
// and come alive (runs 4f14fb23, 21fbcec3 and 896e63b8, 2026-10-23).
const READY_LOOKS = 20
// How many times the box is looked at while files upload (about three minutes), and how many looks in a row it must be unchanged
// before the upload counts as done: the markup of an upload that is going on keeps changing (recorded: not yet; unverified).
const UPLOAD_LOOKS = 120
const STABLE_LOOKS = 3

const PAUSES = {
   // The conversation loading after the page opened.
   open: [1500, 3500],
   // Between the steps of writing, as a person looks over what they wrote.
   click: [600, 1400],
   typed: [800, 2000],
   look: BOX_PAUSES.look,
} as const

// Writes one reply in a conversation as the signed-in member does: opens its page, checks it is the conversation asked for,
// clicks the box, types the words at a person's pace, presses send, and looks for the message (.plan/unibox-send.md). The
// words and names never reach the log. Whatever happens after send was pressed is read back and handed over as `messages.json`.
export const sendReply = async (
   context: Context,
   baseUrl: string,
   input: ReplyInput,
   { random = Math.random, now = Date.now, today = () => new Date() }: Deps = {}
): Promise<ReplyResult> => {
   const { browser, visit, pause, log, warn, markAttempt } = context
   const hands = handsOf(browser)
   const reader = createReader({
      hands,
      pause,
      random,
      now,
      pace: PACE,
   })
   const session = createSession({
      browser,
      hands,
      visit,
      log,
      baseUrl,
   })
   const box = createMessageBox({
      hands,
      reader,
      log,
      box: COMPOSER,
      send: SEND_BUTTON,
      messagesOf: html => parseThread(html, today()).messages,
   })
   const clearBox = box.clear
   const handOverSafely = (html: string) =>
      handOverPage(html, {
         context,
         id: input.thread,
         title: input.title,
         today: today(),
         now: new Date(now()),
      })

   // The page as it is once the conversation has its name and its box; as it is after the last look when it never gets them.
   const settled = async () => {
      let html = await hands.html()

      for (let look = 0; look < READY_LOOKS; look += 1) {
         if (parseThread(html, today()).title !== '' && parseComposer(html).present) {
            break
         }

         await reader.wait(PAUSES.look)
         html = await hands.html()
      }

      return html
   }

   // Whether the box stops changing after files were given to it, which is when they have uploaded.
   const uploaded = async () => {
      let last = ''
      let stable = 0

      for (let look = 0; look < UPLOAD_LOOKS; look += 1) {
         const now = composerHtml(await hands.html())

         stable = now === last ? stable + 1 : 0
         last = now

         if (stable >= STABLE_LOOKS) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // After send was pressed: what the shared box saw, as the reply's verdict. Whatever the page showed is handed over.
   const confirm = async (answers: AnswerWatch): Promise<ReplyResult> => {
      const { outcome, html } = await box.confirm(answers, input.text, before)

      if (outcome === 'NOT_SENT') {
         return {
            outcome: 'FAILED',
            why: 'NOT_SENT',
         }
      }

      if (html !== '') {
         handOverSafely(html)
      }

      return { outcome }
   }

   let fetched: Fetched | undefined

   // Gives the files of the upload to the page, images to the images' input and the rest to the other, and waits for them to upload;
   // says why when it cannot.
   const attachFiles = async (): Promise<ReplyResult | undefined> => {
      if (!context.uploads || !input.uploadId) {
         log('The files cannot be fetched here')

         return {
            outcome: 'FAILED',
            why: 'NO_FILES',
         }
      }

      try {
         fetched = await context.uploads.fetch(
            input.uploadId,
            input.files.map(({ name }) => name)
         )
      } catch (error) {
         warn(describeError(error, 'The files could not be fetched'))

         return {
            outcome: 'FAILED',
            why: 'NO_FILES',
         }
      }

      const paths = (images: boolean) =>
         fetched?.paths.filter((_, index) => (input.files[index]?.kind === 'IMAGE') === images) ?? []
      const [pictures, others] = [paths(true), paths(false)]

      if (
         (pictures.length > 0 && !(await hands.attachFiles(IMAGE_INPUT, pictures))) ||
         (others.length > 0 && !(await hands.attachFiles(FILE_INPUT, others)))
      ) {
         log('The page offers no place to attach files')

         return {
            outcome: 'FAILED',
            why: 'ATTACH',
         }
      }

      log(`Attached ${input.files.length} files`)

      if (!(await uploaded())) {
         log('The files did not finish uploading')
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'UPLOAD',
         }
      }

      return undefined
   }

   let pressed = false
   let answers: AnswerWatch | undefined
   let before: { id: string | undefined; count: number } = {
      id: undefined,
      count: 0,
   }

   try {
      await session.acceptConsent(await session.open(`${baseUrl}${MESSAGING_PATH}thread/${input.thread}/`))
      log('Opened the conversation')
      await reader.wait(PAUSES.open)

      const opened = THREAD_ID.exec(new URL(session.signedIn((await hands.inspect()).url)).pathname)?.[1]
      const html = await settled()
      const { title, messages } = parseThread(html, today())

      before = {
         id: messages.at(-1)?.id,
         count: messages.length,
      }

      if (opened !== input.thread || (input.title !== '' && title !== input.title)) {
         log('The page is on another conversation')

         return { outcome: 'WRONG_THREAD' }
      }

      if (!parseComposer(html).present) {
         log('The page has no place to write')

         return { outcome: 'NO_COMPOSER' }
      }

      // Asked before anything is typed: a command delivered again after the send may have gone writes nothing.
      if (!(await markAttempt())) {
         log('This reply was started before')

         return { outcome: 'UNKNOWN' }
      }

      await hands.clickSelector(COMPOSER)
      await reader.wait(PAUSES.click)

      if (input.files.length > 0) {
         const failed = await attachFiles()

         if (failed) {
            return failed
         }

         await hands.clickSelector(COMPOSER)
         await reader.wait(PAUSES.click)
      }

      if (
         input.text !== '' &&
         (!(await hands.typeKeys(input.text)) || parseComposer(await hands.html()).typed === '')
      ) {
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'TYPING',
         }
      }

      await reader.wait(PAUSES.typed)

      if (!(await box.sendEnabled())) {
         log('The send button stayed disabled')
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_DISABLED',
         }
      }

      // Listening starts before the press, so the answer to the send request is not missed.
      const watch = hands.watchAnswers('POST', SEND_REQUEST)

      answers = watch

      if (!(await box.press())) {
         log('The send button could not be clicked')
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_NOT_CLICKED',
         }
      }

      pressed = true
      log('Pressed send')

      return await confirm(watch)
   } catch (error) {
      if (error instanceof SignedOut) {
         return { outcome: 'SIGNED_OUT' }
      }

      // Once send was pressed, whatever went wrong may have come after the message went.
      if (pressed) {
         warn(describeError(error, 'The page could not be read after send'))

         return { outcome: 'UNKNOWN' }
      }

      throw error
   } finally {
      answers?.stop()
      await fetched?.remove().catch(() => undefined)
   }
}
