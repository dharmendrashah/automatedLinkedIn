import { type Conversation, type MessagesFile, type ReplyFile, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { COMPOSER, FILE_INPUT, IMAGE_INPUT, MESSAGING_PATH, SEND_BUTTON, THREAD_ID } from '../../linkedin/markup'
import {
   composerHtml,
   newestIsOurs,
   parseComposer,
   parseOwner,
   parseThread,
   toContractMessages,
} from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'
import { fileName, partsOf } from '../linkedinMessages/messagesFile'
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

// How many times the page is looked at for the message after send was pressed.
const LOOKS = 6
// How many times the page is looked at for its conversation and box, and the box's send button for being enabled: through a slow
// proxy the page can take half a minute to draw and come alive (runs 4f14fb23, 21fbcec3 and 896e63b8, 2026-10-23).
const READY_LOOKS = 20
const ENABLE_LOOKS = 8
// How many times the box is looked at while files upload (about three minutes), and how many looks in a row it must be unchanged
// before the upload counts as done: the markup of an upload that is going on keeps changing (recorded: not yet; unverified).
const UPLOAD_LOOKS = 120
const STABLE_LOOKS = 3
// How many times the page is scrolled a little to bring the send button into view (run 896e63b8: a notice at the top pushed the
// box to the edge of the window and the button below it).
const REVEAL_SCROLLS = 4
const REVEAL_PIXELS = [150, 300] as const

const PAUSES = {
   // The conversation loading after the page opened.
   open: [1500, 3500],
   // Between the steps of writing, as a person looks over what they wrote.
   click: [600, 1400],
   typed: [800, 2000],
   // The message arriving after send, and between two looks for it.
   sent: [1200, 2400],
   look: [900, 1600],
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
   const { browser, visit, pause, log, warn, attach, markAttempt } = context
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

   // Empties the box of what was typed, so no draft is left on the account's page; it is no help when it cannot.
   const clearBox = async () => {
      await hands.press('ControlOrMeta+A')
      await hands.press('Delete')
   }

   // What the page shows of the conversation, handed over as the contract's file, so the importer sees the new message.
   const handOver = (html: string) => {
      const { title, kind, participants, messages } = parseThread(html, today())
      const owner = parseOwner(html)
      const conversation: Conversation = {
         id: input.thread,
         title: title || input.title,
         kind,
         participants,
         unread: false,
         lastActivity: '',
         complete: false,
         messages: toContractMessages(messages),
      }
      const parts: MessagesFile[] = partsOf([conversation], new Date(now()).toISOString()).map(part => ({
         ...part,
         ...(owner && { account: owner }),
      }))

      for (const part of parts) {
         attach(fileName(part.part), JSON.stringify(messagesFileSchema.parse(part), null, 1), 'application/json')
      }
   }

   // The verdict never depends on this: the message was looked for and decided on before, so a page that cannot be handed over
   // costs the importer the new message (the next read finds it), never a reply that went.
   const handOverSafely = (html: string) => {
      try {
         handOver(html)
      } catch {
         warn('The page could not be handed over.')
      }
   }

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

   // Whether the send button comes alive once the words are typed (it is disabled until the page has taken them in).
   const sendEnabled = async () => {
      for (let look = 0; look < ENABLE_LOOKS; look += 1) {
         if (parseComposer(await hands.html()).canSend) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Presses the send button; the page is scrolled a little first when the button is below the edge of the window.
   const pressSend = async () => {
      for (let scrolls = 0; scrolls <= REVEAL_SCROLLS; scrolls += 1) {
         if (await hands.clickSelector(SEND_BUTTON)) {
            return true
         }

         if (scrolls < REVEAL_SCROLLS) {
            const pixels = reader.span(REVEAL_PIXELS)

            if (!(await hands.scrollOver(COMPOSER, pixels))) {
               await hands.scrollBy(pixels)
            }

            await reader.wait(PAUSES.look)
         }
      }

      return false
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

   // After send was pressed: looks for the message, and says what it saw.
   const confirm = async (): Promise<ReplyResult> => {
      await reader.wait(PAUSES.sent)

      let html = ''

      for (let look = 0; look < LOOKS; look += 1) {
         html = await hands.html()

         if (newestIsOurs(parseThread(html, today()).messages, input.text, before)) {
            handOverSafely(html)

            return { outcome: 'SENT' }
         }

         await reader.wait(PAUSES.look)
      }

      // The words still in the box mean send did nothing; an empty box and no message means it may have gone.
      if (parseComposer(html).typed !== '') {
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'NOT_SENT',
         }
      }

      handOverSafely(html)

      return { outcome: 'UNKNOWN' }
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

      if (!(await sendEnabled())) {
         log('The send button stayed disabled')
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_DISABLED',
         }
      }

      if (!(await pressSend())) {
         log('The send button could not be clicked')
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_NOT_CLICKED',
         }
      }

      pressed = true
      log('Pressed send')

      return await confirm()
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
      await fetched?.remove().catch(() => undefined)
   }
}
