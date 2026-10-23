import { type Conversation, type MessagesFile, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { COMPOSER, MESSAGING_PATH, SEND_BUTTON, THREAD_ID } from '../../linkedin/markup'
import { newestIsOurs, parseComposer, parseOwner, parseThread } from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'
import { fileName, partsOf } from '../linkedinMessages/messagesFile'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt'>

export type ReplyInput = {
   // The id of the conversation in the address of its page, and its name as the page shows it (empty: not checked).
   thread: string
   title: string
   text: string
}

// SENT: the message shows as the newest of the account. UNKNOWN: send was pressed and the page does not show it, so it may
// or may not have gone (nothing is typed again for it). FAILED: nothing was sent. NO_COMPOSER: the page offers no place to
// write. WRONG_THREAD: the page is on another conversation. SIGNED_OUT: LinkedIn asked for a sign-in.
export type ReplyResult =
   | { outcome: 'SENT' | 'UNKNOWN' | 'NO_COMPOSER' | 'WRONG_THREAD' | 'SIGNED_OUT' }
   | { outcome: 'FAILED'; why: 'TYPING' | 'SEND_DISABLED' | 'NOT_SENT' }

type Deps = {
   random?: () => number
   now?: () => number
   today?: () => Date
}

// How many times the page is looked at for the message after send was pressed.
const LOOKS = 6

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
         messages,
      }
      const parts: MessagesFile[] = partsOf([conversation], new Date(now()).toISOString()).map(part => ({
         ...part,
         ...(owner && { account: owner }),
      }))

      for (const part of parts) {
         attach(fileName(part.part), JSON.stringify(messagesFileSchema.parse(part), null, 1), 'application/json')
      }
   }

   // After send was pressed: looks for the message, and says what it saw.
   const confirm = async (): Promise<ReplyResult> => {
      await reader.wait(PAUSES.sent)

      let html = ''

      for (let look = 0; look < LOOKS; look += 1) {
         html = await hands.html()

         if (newestIsOurs(parseThread(html, today()).messages, input.text)) {
            handOver(html)

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

      handOver(html)

      return { outcome: 'UNKNOWN' }
   }

   let pressed = false

   try {
      await session.acceptConsent(await session.open(`${baseUrl}${MESSAGING_PATH}thread/${input.thread}/`))
      log('Opened the conversation')
      await reader.wait(PAUSES.open)

      const opened = THREAD_ID.exec(new URL(session.signedIn((await hands.inspect()).url)).pathname)?.[1]
      const html = await hands.html()
      const { title } = parseThread(html, today())

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

      if (!(await hands.typeKeys(input.text)) || parseComposer(await hands.html()).typed === '') {
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'TYPING',
         }
      }

      await reader.wait(PAUSES.typed)

      if (!parseComposer(await hands.html()).canSend) {
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_DISABLED',
         }
      }

      if (!(await hands.clickSelector(SEND_BUTTON))) {
         await clearBox()

         return {
            outcome: 'FAILED',
            why: 'SEND_DISABLED',
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
   }
}
