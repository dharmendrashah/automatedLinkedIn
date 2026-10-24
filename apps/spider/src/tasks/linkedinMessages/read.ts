import { type Conversation, type MessagesFile, messagesFileSchema } from '@automatedLinkedIn/contracts'

import { StepFailed } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import {
   INBOX_LIST,
   INBOX_ROW,
   LOAD_MORE,
   MESSAGING_PATH,
   NEVER_CLICK,
   THREAD_ID,
   THREAD_PANE,
} from '../../linkedin/markup'
import { parseInbox, parseOwner, parseThread, rowHash } from '../../linkedin/messageReader'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'
import { PICTURES_PER_RUN, keepPictures } from './keepPictures'
import { fileName, partsOf } from './messagesFile'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot' | 'kept'>

export type MessagesInput = {
   // How many conversations of the list to read, newest activity first.
   limit: number
   // How many of the top of the list to leave out, to go on where an earlier run stopped.
   skip: number
   // The rows brain already has, by `rowHash`: such a row is left alone unless it is unread.
   known: string[]
   // Stop after this many rows in a row that were left alone: the list is newest first, so what is below did not change either.
   stopAfterKnown?: number
   // Keep the pages with the run, to study how they are built.
   snapshots: boolean
}

// DONE: everything asked for was read, or the list ended. PARTIAL: it stopped before (time, or conversations that would not open).
// SIGNED_OUT: LinkedIn asked for a sign-in.
// `next` is the place in the list after the last row gone through (read, or left alone as known), so one that failed in between is
// not counted as read nor makes the run skip ahead. `unchanged` is how many rows were left alone. `finished` is true when the walk
// reached the end of the list or the first rows it knew (`stopAfterKnown`): there is nothing to go on with.
export type MessagesRead = {
   outcome: 'DONE' | 'PARTIAL' | 'SIGNED_OUT'
   conversations: number
   messages: number
   next: number
   unchanged: number
   finished: boolean
}

type Deps = {
   random?: () => number
   now?: () => number
   // The calendar day it is, for dates the page shows without a year or as "Today".
   today?: () => Date
}

// No new conversation is begun after this much of the run; the time limit of the task is longer, so the one in progress can end.
export const BUDGET_MS = 20 * 60 * 1000
// After this many conversations in a row that came to nothing the run stops: something is wrong.
const MAX_FAILURES_IN_A_ROW = 3
// How many times the list is looked at and scrolled before a row is given up.
const ROW_TRIES = 30
// How many times a list with no row at all is looked at before the inbox counts as empty: through a slow proxy the page can take
// half a minute to draw its list (run 0d61545f, 2026-10-23).
const EMPTY_TRIES = 20
// How many times a conversation is scrolled up toward its first message, and the most messages kept of one.
const MAX_THREAD_SCROLLS = 80
const MAX_MESSAGES = 3000

// How many times the address is looked at for a conversation that opens slowly after its row was clicked.
const OPEN_POLLS = 8

const PAUSES = {
   // The messages loading after the page opened.
   open: [1500, 3500],
   // Between two looks at the address of a conversation that is opening.
   poll: [700, 1200],
   // The list scrolling and loading, and older messages loading in a conversation.
   list: [900, 2200],
   older: [900, 2200],
   // Between two conversations.
   between: [3000, 9000],
} as const
const SCROLL = {
   list: [300, 520],
   older: [500, 900],
} as const

// Reads the conversations of an account's messages and hands them to the run as numbered `messages.json` files
// (.plan/linkedin-messages.md). It opens each conversation of the list by a click, as a person does (which marks it read), scrolls
// up it until its first message is loaded, and reads what the page shows. Names and words of messages never reach the log.
export const readMessages = async (
   context: Context,
   baseUrl: string,
   input: MessagesInput,
   { random = Math.random, now = Date.now, today = () => new Date() }: Deps = {}
): Promise<MessagesRead> => {
   const { browser, visit, pause, log, warn, attach } = context
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
   const keep = createKeep(context, input.snapshots)
   const conversations: Conversation[] = []
   const seen = new Set<string>()
   const known = new Set(input.known)
   const pictures = { left: PICTURES_PER_RUN }
   let owner: MessagesFile['account']
   let ended = false
   let next = input.skip
   // Rows left alone, and how many in a row; whether the list was seen at all (an empty page is not an inbox that ended).
   let unchanged = 0
   let unchangedInARow = 0
   let sawRows = false
   let finished = false
   // Whether the row just gone through was not opened, so there is nothing to pace.
   let idle = false

   // The id of the conversation the page is on, or undefined when it is on the list alone.
   const currentThread = async () =>
      THREAD_ID.exec(new URL(session.signedIn((await hands.inspect()).url)).pathname)?.[1]

   // The row of the list at this place, clicked, and the conversation the page was on before. The list shows a few rows and loads
   // more as it is scrolled to its end, and it draws only the rows near the window, so it is scrolled, as a person does, until the
   // row is drawn and in view; undefined when the list has no such row.
   const openRow = async (index: number) => {
      for (let tries = 0; tries < ROW_TRIES; tries += 1) {
         const html = await hands.html()
         const { rows, more } = parseInbox(html)
         const row = rows[index]

         owner ??= parseOwner(html)

         if (rows.length === 0) {
            if (tries >= EMPTY_TRIES) {
               return undefined
            }

            await reader.wait(PAUSES.list)

            continue
         }

         sawRows = true

         if (row?.hydrated && row.linkIndex !== undefined) {
            // A row brain already has, with nothing unread in it, is not opened: opening marks it read for the sender to see.
            if (!row.unread && known.has(rowHash(row))) {
               return {
                  row,
                  unchanged: true as const,
               }
            }

            const before = await currentThread()

            if (await hands.clickNth(INBOX_ROW, row.linkIndex, NEVER_CLICK)) {
               return {
                  row,
                  before,
                  unchanged: false as const,
               }
            }
         }

         // A row that is in the list but not drawn or not in view may be below or above; the first half of the tries look below.
         const down = !row?.hydrated || tries < ROW_TRIES / 2
         const moved = await hands.scrollOver(INBOX_LIST, down ? reader.span(SCROLL.list) : -reader.span(SCROLL.list))

         await reader.wait(PAUSES.list)

         if (!row && !moved) {
            if (!more) {
               return undefined
            }

            await hands.clickSelector(LOAD_MORE)
         }
      }

      throw new StepFailed('The conversation could not be opened.')
   }

   // The conversation opens a moment after its row was clicked, so the address is looked at until it is another one. The row of the
   // conversation that was already open changes nothing, and is read if it has not been.
   const openedThread = async (before: string | undefined) => {
      for (let polls = 0; polls < OPEN_POLLS; polls += 1) {
         await reader.wait(PAUSES.poll)

         const id = await currentThread()

         if (id && id !== before) {
            return id
         }
      }

      return before && !seen.has(before) ? before : undefined
   }

   // Scrolls up the open conversation until its first message is loaded, or it holds as many as are kept.
   const readThread = async () => {
      let thread = parseThread(await hands.html(), today())

      for (
         let scrolls = 0, stuck = 0;
         scrolls < MAX_THREAD_SCROLLS && thread.messages.length < MAX_MESSAGES;
         scrolls += 1
      ) {
         const before = thread.messages.length
         const moved = await hands.scrollOver(THREAD_PANE, -reader.span(SCROLL.older))

         await reader.wait(PAUSES.older)
         thread = parseThread(await hands.html(), today())

         // At the top with nothing new, three times in a row: the first message has been reached (older ones load a moment after the scroll).
         stuck = !moved && thread.messages.length === before ? stuck + 1 : 0

         if (stuck >= 3) {
            return {
               thread,
               complete: true,
            }
         }
      }

      return {
         thread,
         complete: false,
      }
   }

   const readConversation = async (index: number) => {
      if (ended) {
         return false
      }

      const opened = await openRow(index)

      if (!opened) {
         ended = true
         idle = true
         finished = sawRows

         return false
      }

      if (opened.unchanged) {
         unchanged += 1
         unchangedInARow += 1
         next = index + 1
         idle = true

         if (input.stopAfterKnown !== undefined && unchangedInARow >= input.stopAfterKnown) {
            ended = true
            finished = true
         }

         return true
      }

      unchangedInARow = 0
      idle = false

      const { row, before } = opened
      const id = await openedThread(before)

      // A click that did nothing leaves the page on the conversation before: it is not read twice.
      if (!id || seen.has(id)) {
         log(`The page stayed ${before ? 'on the conversation before' : 'on the list'}`)
         await keep('not-opened')

         throw new StepFailed('The conversation did not open.')
      }

      seen.add(id)
      log(`Opened conversation ${index + 1}`)
      await keep('thread')

      const { thread, complete } = await readThread()
      // The page is still on the conversation, so the addresses of its pictures are fresh.
      const messages = await keepPictures(
         thread.messages,
         {
            kept: context.kept,
            fetchFile: hands.fetchFile,
            warn,
         },
         pictures
      )

      conversations.push({
         id,
         title: thread.title || row.title,
         kind: thread.kind,
         participants: thread.participants,
         unread: row.unread,
         lastActivity: row.when,
         rowHash: rowHash(row),
         complete,
         messages,
      })
      log(`Read ${thread.messages.length} messages`)
      next = index + 1

      return true
   }

   const reopenList = async () => {
      await session.open(`${baseUrl}${MESSAGING_PATH}`)
      await reader.wait(PAUSES.open)
   }

   // A click that did nothing is tried once more from a fresh list, as a person would; on staging about one conversation in four
   // did not open the first time (run 56c66a47, 2026-10-24).
   const readOrRetry = async (index: number) => {
      try {
         return await readConversation(index)
      } catch (error) {
         if (!(error instanceof StepFailed)) {
            throw error
         }

         log('Trying the conversation again')
         await reopenList()

         return readConversation(index)
      }
   }

   // What was read is handed over whatever happened after it, so a run that stops half way still gives the owner its half.
   const handOver = () => {
      const parts: MessagesFile[] = partsOf(conversations, new Date(now()).toISOString()).map(part => ({
         ...part,
         ...(owner && { account: owner }),
      }))

      for (const part of parts) {
         attach(fileName(part.part), JSON.stringify(messagesFileSchema.parse(part), null, 1), 'application/json')
      }
   }
   const total = () => conversations.reduce((sum, { messages }) => sum + messages.length, 0)
   const result = (outcome: MessagesRead['outcome']): MessagesRead => ({
      outcome,
      conversations: conversations.length,
      messages: total(),
      next,
      unchanged,
      finished,
   })

   try {
      await session.acceptConsent(await session.open(`${baseUrl}${MESSAGING_PATH}`))
      log('Opened the messages')
      await reader.wait(PAUSES.open)
      await keep('inbox')

      const targets = Array.from({ length: input.limit }, (_, offset) => input.skip + offset)
      const done = await runTargets({
         targets,
         step: readOrRetry,
         recover: reopenList,
         between: () => (idle ? Promise.resolve() : reader.wait(PAUSES.between)),
         elapsed: reader.elapsed,
         budgetMs: BUDGET_MS,
         maxFailuresInARow: MAX_FAILURES_IN_A_ROW,
         isFatal: error => error instanceof SignedOut,
         warn,
         says: {
            stepStopped: 'A conversation stopped early',
            notRecovered: 'The messages could not be opened again',
         },
      })

      return result(ended || done === targets.length ? 'DONE' : 'PARTIAL')
   } catch (error) {
      if (error instanceof SignedOut) {
         return result('SIGNED_OUT')
      }

      throw error
   } finally {
      handOver()
   }
}
