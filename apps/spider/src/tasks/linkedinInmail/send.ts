import { type ReplyFile } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { slugKey } from '../../linkedin/inviteReader'
import {
   INMAIL_COMPOSER,
   INMAIL_FILE_INPUT,
   INMAIL_FORM,
   INMAIL_IMAGE_INPUT,
   INMAIL_SEND,
   INMAIL_SEND_BUTTON,
   INMAIL_SUBJECT_BOX,
   PROFILE_MESSAGE,
} from '../../linkedin/markup'
import { type Before, createMessageBox } from '../../linkedin/messageBox'
import {
   composerHtml,
   hasProfileMessage,
   parseInmailWindow,
   parseMessageWindow,
   parseThread,
   sameWords,
} from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type AnswerWatch } from '../../scraping/driver'
import { type TaskContext } from '../defineTask'
import { type Fetched } from '../uploads'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'markAttempt' | 'uploads'>

export type InmailInput = {
   // The person's profile address after /in/; the window's card must link to it.
   slug: string
   subject: string
   // May be empty when there are files.
   text: string
   files: ReplyFile[]
   uploadId?: string
}

// SENT: the window turned into a conversation that holds the message, or LinkedIn accepted it. UNKNOWN: send was pressed and neither is
// known (nothing is typed again for it). NO_MESSAGE_BUTTON: the profile shows no Message link. NOT_INMAIL: the window that opened is an
// ordinary conversation window (the person may be a connection). WOULD_COST_CREDIT: the banner does not say "Free message", so nothing
// was typed. NO_COMPOSER: no window or no box. WRONG_RECIPIENT: the window is for someone else, or more than one is open.
// NOT_AVAILABLE: the address did not lead to a profile. DIFFERENT_WORDS: it went, and the conversation shows other words than asked for.
export type InmailResult =
   | {
        outcome:
           | 'SENT'
           | 'UNKNOWN'
           | 'NO_MESSAGE_BUTTON'
           | 'NOT_INMAIL'
           | 'WOULD_COST_CREDIT'
           | 'NO_COMPOSER'
           | 'WRONG_RECIPIENT'
           | 'NOT_AVAILABLE'
           | 'SIGNED_OUT'
           | 'DIFFERENT_WORDS'
     }
   | {
        outcome: 'FAILED'
        why: 'TYPING' | 'SUBJECT' | 'NO_FILES' | 'ATTACH' | 'UPLOAD' | 'SEND_DISABLED' | 'SEND_NOT_CLICKED' | 'NOT_SENT'
     }

type Deps = {
   random?: () => number
   now?: () => number
   today?: () => Date
}

// Through a slow proxy a profile can take half a minute to draw, and the window a few seconds to open.
const READY_LOOKS = 20
// The Message link may open a window over the profile or load the whole compose page, which takes longer.
const WINDOW_LOOKS = 20
// How many looks at the window while files upload, and how many in a row it must be unchanged to count as uploaded.
const UPLOAD_LOOKS = 120
const STABLE_LOOKS = 3

// The words are typed in pieces of about this many characters, and the box is read back before send: through a slow page the editor
// drops key presses (run cbfe04bb, 2026-11-03: the tail of the words was missing and the message went with other words than asked).
const PIECE_CHARS = 24
const TYPE_TRIES = 2
const HOLD_LOOKS = 4

const PAUSES = {
   open: [2000, 4000],
   look: [900, 1600],
   click: [600, 1400],
   typed: [800, 2000],
   piece: [200, 500],
} as const

// The words cut after a space into pieces of about PIECE_CHARS characters.
const piecesOf = (text: string) =>
   text.split(/(?<=\s)/).reduce<string[]>((pieces, word) => {
      const last = pieces.at(-1)

      return last !== undefined && last.length + word.length <= PIECE_CHARS
         ? [...pieces.slice(0, -1), last + word]
         : [...pieces, word]
   }, [])

// The request the page makes to send a message. The recorder keeps no query strings, so `action=createMessage` could not be checked
// for this window (2026-11-03): the page showing the message is the main proof and this answer only counts when the page never shows it.
const SEND_REQUEST = ['voyagerMessagingDashMessengerMessages']

const profileSlug = (href: string) => slugKey(/\/in\/([^/?#]+)/.exec(href)?.[1] ?? '')

// Writes a free message to a member the account is not connected to, as the member would (.plan/linkedin-inmail.md): opens their
// profile, presses its Message link, checks the window is LinkedIn's window for a free message to exactly this person, types the
// subject and words at a person's pace, presses send once and checks the window turned into a conversation that holds the message.
// A paid message is never started: nothing is typed unless the banner says "Free message". Words and names never reach the log.
export const sendInmail = async (
   context: Context,
   baseUrl: string,
   input: InmailInput,
   { random = Math.random, now = Date.now, today = () => new Date() }: Deps = {}
): Promise<InmailResult> => {
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
   // Over the profile the window turns into a conversation; on the compose page the page turns into one.
   const messagesOf = (html: string) => {
      const window = parseMessageWindow(html, today())

      return window.open ? window.messages : parseThread(html, today()).messages
   }
   const box = createMessageBox({
      hands,
      reader,
      log,
      box: INMAIL_COMPOSER,
      send: INMAIL_SEND_BUTTON,
      scope: INMAIL_FORM,
      sendInside: INMAIL_SEND,
      messagesOf,
   })

   // Looks at the page until `ready` says yes, as a person waits for it; the last page read either way.
   const until = async (looks: number, ready: (html: string) => boolean) => {
      let html = await hands.html()

      for (let look = 0; look < looks && !ready(html); look += 1) {
         await reader.wait(PAUSES.look)
         html = await hands.html()
      }

      return html
   }

   // Whether the window stops changing after files were given to it, which is when they have uploaded.
   const uploaded = async () => {
      let last = ''
      let stable = 0

      for (let look = 0; look < UPLOAD_LOOKS; look += 1) {
         const current = composerHtml(await hands.html(), INMAIL_FORM)

         stable = current === last ? stable + 1 : 0
         last = current

         if (stable >= STABLE_LOOKS) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Whether the box holds the words, given the editor a few looks to draw them.
   const boxHolds = async (text: string) => {
      for (let look = 0; look < HOLD_LOOKS; look += 1) {
         if (sameWords(box.composer(await hands.html()).typed, text)) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Types the words piece by piece and checks the box holds all of them; when it does not (a key press was lost), the box is emptied
   // and the words are typed once more. False means nothing trustworthy is in the box, and send must not be pressed.
   const typeWords = async (text: string) => {
      for (let attempt = 0; attempt < TYPE_TRIES; attempt += 1) {
         for (const piece of piecesOf(text)) {
            if (!(await hands.typeKeys(piece))) {
               return false
            }

            await reader.wait(PAUSES.piece)
         }

         if (await boxHolds(text)) {
            return true
         }

         log('The box does not hold the words that were typed')
         await hands.clickSelector(INMAIL_COMPOSER)
         await box.clear()
         await reader.wait(PAUSES.typed)
      }

      return false
   }

   let fetched: Fetched | undefined

   // Gives the files of the upload to the window, images to its images' input and the rest to the other, and waits for them to upload;
   // says why when it cannot.
   const attachFiles = async (): Promise<InmailResult | undefined> => {
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
         (pictures.length > 0 && !(await hands.attachFiles(INMAIL_IMAGE_INPUT, pictures))) ||
         (others.length > 0 && !(await hands.attachFiles(INMAIL_FILE_INPUT, others)))
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
         await box.clear()

         return {
            outcome: 'FAILED',
            why: 'UPLOAD',
         }
      }

      return undefined
   }

   let pressed = false
   let answers: AnswerWatch | undefined

   try {
      await session.open(`${baseUrl}/in/${input.slug}/`)
      await reader.wait(PAUSES.open)

      if (!new URL(session.signedIn((await hands.inspect()).url)).pathname.startsWith('/in/')) {
         log('The address did not lead to a profile')

         return { outcome: 'NOT_AVAILABLE' }
      }

      if (
         !hasProfileMessage(await until(READY_LOOKS, hasProfileMessage)) ||
         !(await hands.clickSelector(PROFILE_MESSAGE))
      ) {
         log('The profile shows no Message link')

         return { outcome: 'NO_MESSAGE_BUTTON' }
      }

      const opened = parseInmailWindow(
         await until(WINDOW_LOOKS, html => {
            const window = parseInmailWindow(html)

            return window.forms > 0 && window.composer.present
         })
      )

      session.signedIn((await hands.inspect()).url)

      if (!opened.open) {
         log('No message window or page opened')

         return { outcome: 'NO_COMPOSER' }
      }

      if (opened.forms === 0) {
         log('An ordinary conversation opened, not a message to a non-connection')

         return { outcome: 'NOT_INMAIL' }
      }

      if (opened.forms > 1) {
         log('More than one place to write a free message is open')

         return { outcome: 'WRONG_RECIPIENT' }
      }

      if (!opened.composer.present) {
         log('The message form has no place to write')

         return { outcome: 'NO_COMPOSER' }
      }

      if (opened.recipients.length === 0 || opened.recipients.some(href => profileSlug(href) !== slugKey(input.slug))) {
         log('The message form is for someone else')

         return { outcome: 'WRONG_RECIPIENT' }
      }

      if (opened.banner !== 'free') {
         log('The message form does not say the message is free')

         return { outcome: 'WOULD_COST_CREDIT' }
      }

      const before: Before = {
         id: undefined,
         count: 0,
      }

      // Asked before anything is typed: a command delivered again after the send may have gone writes nothing.
      if (!(await markAttempt())) {
         log('This message was started before')

         return { outcome: 'UNKNOWN' }
      }

      await hands.clickSelector(INMAIL_COMPOSER)
      await reader.wait(PAUSES.click)

      if (input.files.length > 0) {
         const failed = await attachFiles()

         if (failed) {
            return failed
         }
      }

      if (input.subject !== '') {
         if (!opened.hasSubject || !(await hands.clickSelector(INMAIL_SUBJECT_BOX))) {
            log('The form has no subject box')
            await box.clear()

            return {
               outcome: 'FAILED',
               why: 'SUBJECT',
            }
         }

         await reader.wait(PAUSES.click)

         if (!(await hands.typeKeys(input.subject))) {
            await box.clear()

            return {
               outcome: 'FAILED',
               why: 'SUBJECT',
            }
         }

         await reader.wait(PAUSES.typed)
      }

      if (input.text !== '') {
         // The focus moved to the subject box or the files' picker; the box is clicked again to get it back.
         if (input.subject !== '' || input.files.length > 0) {
            await hands.clickSelector(INMAIL_COMPOSER)
            await reader.wait(PAUSES.click)
         }

         if (!(await typeWords(input.text))) {
            await box.clear()

            return {
               outcome: 'FAILED',
               why: 'TYPING',
            }
         }

         await reader.wait(PAUSES.typed)
      }

      if (!(await box.sendEnabled())) {
         log('The send button stayed disabled')
         await box.clear()

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
         await box.clear()

         return {
            outcome: 'FAILED',
            why: 'SEND_NOT_CLICKED',
         }
      }

      pressed = true
      log('Pressed send')

      const { outcome, html } = await box.confirm(watch, input.text, before)

      if (outcome === 'NOT_SENT') {
         return {
            outcome: 'FAILED',
            why: 'NOT_SENT',
         }
      }

      // LinkedIn's answer can say it went while the page shows a conversation of this one message with other words.
      const [only, ...rest] = messagesOf(html)

      if (
         outcome === 'SENT' &&
         input.text !== '' &&
         only?.direction === 'ME' &&
         rest.length === 0 &&
         !sameWords(only.text, input.text)
      ) {
         log('The conversation shows other words than the ones asked for')

         return { outcome: 'DIFFERENT_WORDS' }
      }

      return { outcome }
   } catch (error) {
      if (error instanceof SignedOut) {
         return { outcome: pressed ? 'UNKNOWN' : 'SIGNED_OUT' }
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
