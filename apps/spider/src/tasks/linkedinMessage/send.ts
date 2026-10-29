import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import {
   MESSAGE_WINDOW,
   MESSAGING_PATH,
   PROFILE_MESSAGE,
   THREAD_ID,
   WINDOW_COMPOSER,
   WINDOW_SEND_BUTTON,
} from '../../linkedin/markup'
import { type Before, SEND_REQUEST, createMessageBox, handOverPage } from '../../linkedin/messageBox'
import { hasProfileMessage, newestIsOurs, parseMessageWindow, parseThread } from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type AnswerWatch } from '../../scraping/driver'
import { type TaskContext } from '../defineTask'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt'>

export type MessageInput = {
   // The person's profile address after /in/, and their name as stored, to check the window is with them.
   slug: string
   name: string
   text: string
}

// SENT: the message shows in the window, or LinkedIn accepted it. UNKNOWN: send was pressed and neither is known (nothing is typed again
// for it). NO_MESSAGE_BUTTON: the profile shows no Message link (not a connection, or a layout not seen). NO_COMPOSER: the window did not
// open with a box. WRONG_RECIPIENT: the window is with someone else. NOT_AVAILABLE: the address did not lead to a profile.
export type MessageResult =
   | {
        outcome:
           'SENT' | 'UNKNOWN' | 'NO_MESSAGE_BUTTON' | 'NO_COMPOSER' | 'WRONG_RECIPIENT' | 'NOT_AVAILABLE' | 'SIGNED_OUT'
     }
   | { outcome: 'FAILED'; why: 'TYPING' | 'SEND_DISABLED' | 'SEND_NOT_CLICKED' | 'NOT_SENT' }

type Deps = {
   random?: () => number
   now?: () => number
   today?: () => Date
}

// Through a slow proxy a profile can take half a minute to draw, and the window a few seconds to open.
const READY_LOOKS = 20
const WINDOW_LOOKS = 12

const PAUSES = {
   open: [2000, 4000],
   look: [900, 1600],
   click: [600, 1400],
   typed: [800, 2000],
} as const

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

// Whether the name the window shows is the person's: their first name must be in it. Names are never logged.
export const sameName = (shown: string, name: string) => {
   const [first] = fold(name).split(/\s+/).filter(Boolean)

   return (
      first !== undefined &&
      fold(shown)
         .split(/[^\p{L}\p{N}]+/u)
         .includes(first)
   )
}

// Writes a first message to a connection as the member does (.plan/message-connections.md): opens their profile, presses its Message
// link, checks the window that opens is with them, types the words at a person's pace and presses send. Earlier messages in the window
// are a conversation brain did not know of; the owner chose to send there too. After a send the newest conversation of /messaging/ is
// handed over when it is clearly this one, so brain learns its id.
export const sendMessage = async (
   context: Context,
   baseUrl: string,
   input: MessageInput,
   { random = Math.random, now = Date.now, today = () => new Date() }: Deps = {}
): Promise<MessageResult> => {
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
   const window = (html: string) => parseMessageWindow(html, today())
   const box = createMessageBox({
      hands,
      reader,
      log,
      box: WINDOW_COMPOSER,
      send: WINDOW_SEND_BUTTON,
      scope: MESSAGE_WINDOW,
      messagesOf: html => window(html).messages,
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

   // The newest conversation of /messaging/ is the one just written to; it is handed over only when it says so itself.
   const handOverNewest = async () => {
      try {
         await session.open(`${baseUrl}${MESSAGING_PATH}`)
         await reader.wait(PAUSES.open)

         const html = await until(READY_LOOKS, page => parseThread(page, today()).title !== '')
         const id = THREAD_ID.exec(new URL(session.signedIn((await hands.inspect()).url)).pathname)?.[1]
         const { title, messages } = parseThread(html, today())

         if (id && sameName(title, input.name) && newestIsOurs(messages, input.text)) {
            handOverPage(html, {
               context,
               id,
               title: input.name,
               today: today(),
               now: new Date(now()),
            })
            log('Handed the new conversation over')
         } else {
            log('The newest conversation could not be told to be this one; the next read stores it')
         }
      } catch (error) {
         warn(describeError(error, 'The conversation could not be handed over'))
      }
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

      const opened = window(await until(WINDOW_LOOKS, html => window(html).composer.present))

      if (!opened.composer.present) {
         log(opened.open ? 'The message window has no place to write' : 'The message window did not open')

         return { outcome: 'NO_COMPOSER' }
      }

      if (!sameName(opened.title, input.name)) {
         log('The message window is with someone else')

         return { outcome: 'WRONG_RECIPIENT' }
      }

      const before: Before = {
         id: opened.messages.at(-1)?.id,
         count: opened.messages.length,
      }

      if (before.count > 0) {
         log(`The window shows ${before.count} earlier messages`)
      }

      // Asked before anything is typed: a command delivered again after the send may have gone writes nothing.
      if (!(await markAttempt())) {
         log('This message was started before')

         return { outcome: 'UNKNOWN' }
      }

      await hands.clickSelector(WINDOW_COMPOSER)
      await reader.wait(PAUSES.click)

      if (!(await hands.typeKeys(input.text)) || box.composer(await hands.html()).typed === '') {
         await box.clear()

         return {
            outcome: 'FAILED',
            why: 'TYPING',
         }
      }

      await reader.wait(PAUSES.typed)

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

      const { outcome } = await box.confirm(watch, input.text, before)

      if (outcome === 'NOT_SENT') {
         return {
            outcome: 'FAILED',
            why: 'NOT_SENT',
         }
      }

      if (outcome === 'SENT') {
         await handOverNewest()
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
   }
}
