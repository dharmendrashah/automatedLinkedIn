import { type Conversation, type MessagesFile, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { type Hands } from '../browsing/hands'
import { type createReader } from '../browsing/reader'
import { type AnswerWatch } from '../scraping/driver'
import { type TaskContext } from '../tasks/defineTask'
import { fileName, partsOf } from '../tasks/linkedinMessages/messagesFile'
import {
   type ReadMessage,
   newestIsOurs,
   parseComposer,
   parseOwner,
   parseThread,
   toContractMessages,
} from './messageReader'

// Writing in LinkedIn's message box and pressing send, shared by a reply in a conversation page and a first message in the window a
// profile opens (both recorded: the same `form.msg-form`). Nothing here decides when to start; the task checks the page first and asks
// `markAttempt()` before typing.

// How many times the page is looked at for the message after send was pressed; a look that cannot read the page counts, and the
// next one is tried (a page that is moving cannot always be read).
const LOOKS = 10
// The request the page makes to send a message, which LinkedIn answers whether or not the page draws the message in time (run
// 87852d9b, 2026-10-23: createMessage answered 200, and the message showed in the video).
export const SEND_REQUEST = ['voyagerMessagingDashMessengerMessages', 'action=createMessage']
const accepted = (status: number) => status >= 200 && status < 300
const refused = (status: number) => status >= 400 && status < 500
// How many looks for the send button to come alive once the words are typed.
const ENABLE_LOOKS = 8
// How many times the page is scrolled a little to bring the send button into view (run 896e63b8: a notice at the top pushed the
// box to the edge of the window and the button below it).
const REVEAL_SCROLLS = 4
const REVEAL_PIXELS = [150, 300] as const

export const BOX_PAUSES = {
   // The message arriving after send, and between two looks for it.
   sent: [1200, 2400],
   look: [900, 1600],
} as const

type Deps = {
   hands: Hands
   reader: ReturnType<typeof createReader>
   log: (message: string) => void
   // The box and its send button; `scope` is the part of the page that holds them (none: the whole page).
   box: string
   send: string
   scope?: string
   // The messages the page shows where the box is.
   messagesOf: (html: string) => ReadMessage[]
}

// The newest message before anything is sent: a message of ours with the same words that was already there is not the one sent.
export type Before = { id: string | undefined; count: number }

// SENT: the message shows, or LinkedIn accepted the send request. NOT_SENT: LinkedIn refused it, or the words are still in the box.
// UNKNOWN: send was pressed and neither is known. `html` is the last page read, for the task to hand over.
export type Confirmed = { outcome: 'SENT' | 'UNKNOWN' | 'NOT_SENT'; html: string }

export const createMessageBox = ({ hands, reader, log, box, send, scope, messagesOf }: Deps) => {
   const composer = (html: string) => parseComposer(html, scope)

   // Empties the box of what was typed, so no draft is left on the account's page; it is no help when it cannot.
   const clear = async () => {
      await hands.press('ControlOrMeta+A')
      await hands.press('Delete')
   }

   // Whether the send button comes alive once the words are typed (it is disabled until the page has taken them in).
   const sendEnabled = async () => {
      for (let look = 0; look < ENABLE_LOOKS; look += 1) {
         if (composer(await hands.html()).canSend) {
            return true
         }

         await reader.wait(BOX_PAUSES.look)
      }

      return false
   }

   // Presses the send button; the page is scrolled a little first when the button is below the edge of the window.
   const press = async () => {
      for (let scrolls = 0; scrolls <= REVEAL_SCROLLS; scrolls += 1) {
         if (await hands.clickSelector(send)) {
            return true
         }

         if (scrolls < REVEAL_SCROLLS) {
            const pixels = reader.span(REVEAL_PIXELS)

            if (!(await hands.scrollOver(box, pixels))) {
               await hands.scrollBy(pixels)
            }

            await reader.wait(BOX_PAUSES.look)
         }
      }

      return false
   }

   // After send was pressed: looks for the message, and says what it saw. The page decides first; when it never shows the message,
   // LinkedIn's own answer to the send request does (accepted: it went; refused: it did not; anything else: not known).
   const confirm = async (answers: AnswerWatch, text: string, before: Before): Promise<Confirmed> => {
      await reader.wait(BOX_PAUSES.sent)

      let html = ''

      for (let look = 0; look < LOOKS; look += 1) {
         try {
            html = await hands.html()

            if (newestIsOurs(messagesOf(html), text, before)) {
               return {
                  outcome: 'SENT',
                  html,
               }
            }
         } catch {
            // A look that cannot read the page is a look lost, not the end of the confirmation.
         }

         await reader.wait(BOX_PAUSES.look)
      }

      const statuses = answers.statuses()

      if (statuses.some(accepted)) {
         log('LinkedIn accepted the message; the page did not show it')

         return {
            outcome: 'SENT',
            html,
         }
      }

      // The box is tidied on a best effort: it must not change what is known about the send.
      if (statuses.length > 0 && statuses.every(refused)) {
         log('LinkedIn refused the message')
         await clear().catch(() => undefined)

         return {
            outcome: 'NOT_SENT',
            html: '',
         }
      }

      // The words still in the box mean send did nothing; an empty box and no message means it may have gone.
      if (html !== '' && composer(html).typed !== '') {
         await clear().catch(() => undefined)

         return {
            outcome: 'NOT_SENT',
            html: '',
         }
      }

      return {
         outcome: 'UNKNOWN',
         html,
      }
   }

   return {
      composer,
      clear,
      sendEnabled,
      press,
      confirm,
   }
}

type HandOver = {
   context: Pick<TaskContext, 'attach' | 'warn'>
   // The conversation's id in the address of its page, and the name to use when the page shows none.
   id: string
   title: string
   today: Date
   now: Date
}

// What a conversation page shows, handed over as the contract's file, so the importer stores the new message. The verdict never depends
// on it: a page that cannot be handed over costs the importer the new message (the next read finds it), never a message that went.
export const handOverPage = (html: string, { context, id, title, today, now }: HandOver) => {
   try {
      const thread = parseThread(html, today)
      const owner = parseOwner(html)
      const conversation: Conversation = {
         id,
         title: thread.title || title,
         kind: thread.kind,
         participants: thread.participants,
         unread: false,
         lastActivity: '',
         complete: false,
         messages: toContractMessages(thread.messages),
      }
      const parts: MessagesFile[] = partsOf([conversation], now.toISOString()).map(part => ({
         ...part,
         ...(owner && { account: owner }),
      }))

      for (const part of parts) {
         context.attach(
            fileName(part.part),
            JSON.stringify(messagesFileSchema.parse(part), null, 1),
            'application/json'
         )
      }
   } catch {
      context.warn('The page could not be handed over.')
   }
}
