import { type HTMLElement, parse } from 'node-html-parser'

import {
   CONNECTIONS_CONTRACT_VERSION,
   type Connection,
   type ConnectionRemoval,
   MAX_CONNECTIONS,
   connectionsFileSchema,
} from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { compactHtml } from '../../browsing/snapshot'
import { parseConnections } from '../../linkedin/connectionReader'
import {
   CANCEL_WORDS,
   CONNECTIONS_PATH,
   CONNECTION_DIALOG_BUTTON,
   CONNECTION_DIALOG_TEXT,
   CONNECTION_MENU_ITEM,
   CONNECTION_ROW,
   REMOVE_WORDS,
   connectionMenuButton,
} from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt'>

export type ConnectionsInput = {
   // The connection to remove, by the part of its profile address after /in/; none reads the list only.
   remove?: string | undefined
   // The newest connections already stored: a read of the newest stops at the first of them (.plan/network-invites.md).
   stopAtKnown?: string[] | undefined
}

// DONE: the list was read to its end (or the removal asked for took). PARTIAL: it was read, but part of it was not (the list was
// cut, a row could not be read, or the connection asked for was gone or its removal not started). UNKNOWN: Remove may have been
// pressed and the page does not say, or the command was delivered again after it may have been, so nothing was pressed. NOT_DRAWN:
// the page showed no connection and did not say there are none. SIGNED_OUT: LinkedIn asked for a sign-in.
export type ConnectionsResult =
   | { outcome: 'SIGNED_OUT' | 'NOT_DRAWN' }
   | {
        outcome: 'DONE' | 'PARTIAL' | 'UNKNOWN'
        read: number
        removal?: ConnectionRemoval['outcome']
     }

type Deps = {
   random?: () => number
   now?: () => number
}

type Listing = {
   connections: Connection[]
   total?: number
   complete: boolean
}

// How many times the page is looked at for its rows before it is called empty (through a proxy a page can take half a minute), how
// many times it is scrolled for more, how many scrolls in a row that bring nothing new are the end of the list, and how long a read
// goes on (a list of a thousand loads ten at a time at a person's pace).
const READY_LOOKS = 20
const MAX_SCROLLS = 250
const END_AFTER = 3
const READ_LIMIT_MS = 20 * 60 * 1000
// How many looks follow a press for the menu or the dialog to draw, and for the row to leave after Remove.
const MENU_LOOKS = 8
const CONFIRM_LOOKS = 12
// The page stays open this long once it has been read, so the last picture and the video end on a settled page.
const END_PAUSE_MS = 5000

const PAUSES = {
   // The page drawing after it opened, and between two looks at it.
   open: [2000, 4500],
   look: [900, 1600],
   // After a scroll for more rows.
   more: [1200, 2600],
   // As a person looks before pressing, and between the steps of a removal.
   before: [1200, 2400],
   step: [700, 1500],
} as const

const ASKS = /^Are you sure you want to remove (.+) as a connection\?$/

const wordsOf = (element: HTMLElement) => element.text.replace(/\s+/g, ' ').trim()

// Where the first element of `selector` that says exactly `words` stands among those the page lists, the number `clickNth` takes;
// -1 when none does.
const positionOf = (html: string, selector: string, words: string) =>
   parse(html)
      .querySelectorAll(selector)
      .findIndex(element => wordsOf(element) === words)

// Reads the connections of the account as the member sees them on the page that lists them all, and removes the one asked for, at a
// person's pace (.plan/my-connections.md). Names and headlines never reach the log; they go only into `connections.json`. Remove is
// never pressed twice: a command delivered again after it may have been pressed presses nothing.
export const runConnections = async (
   context: Context,
   baseUrl: string,
   input: ConnectionsInput,
   { random = Math.random, now = Date.now }: Deps = {}
): Promise<ConnectionsResult> => {
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
   let listing: Listing | undefined
   let removal: ConnectionRemoval | undefined
   let clicked = false
   let repeated = false
   let reachedKnown = false
   const known = new Set(input.stopAtKnown ?? [])

   // Looks at the page until it draws connections, or says it has none; a page that does neither is not called empty.
   const settled = async () => {
      for (let look = 0; look < READY_LOOKS; look += 1) {
         const page = parseConnections(await hands.html())

         if (page.rows > 0 || page.empty) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Scrolls the list over its own rows, so the pane that holds them moves; the page itself when there is no such pane.
   const scrollMore = async () => {
      const pixels = reader.span(PACE.down) + 300

      if (!(await hands.scrollOver(CONNECTION_ROW, pixels))) {
         await hands.scrollBy(pixels)
      }

      await reader.wait(PAUSES.more)
   }

   // Every connection the page draws, scrolling for more until the list stops growing, the heading's count is reached, the limits are
   // reached, or (for a removal) the connection asked for shows. Rows are kept as they were first seen. A list is complete only when the
   // page's own count says so: a read that is not sure is never taken for the whole, since a person it left out would be called gone.
   const readList = async (until?: string): Promise<Listing> => {
      const seen = new Map<string, Connection>()
      const started = now()
      let total: number | undefined
      let unreadable = false
      let stalled = 0
      let stoppedEarly = false

      for (
         let scrolls = 0;
         scrolls <= MAX_SCROLLS && stalled < END_AFTER && seen.size < MAX_CONNECTIONS;
         scrolls += 1
      ) {
         const page = parseConnections(await hands.html())
         const before = seen.size

         total = page.total ?? total
         unreadable ||= page.rows > page.connections.length
         page.connections.forEach(connection => seen.set(connection.slug, seen.get(connection.slug) ?? connection))
         stalled = seen.size > before ? 0 : stalled + 1

         if (page.empty) {
            break
         }

         if (until !== undefined && seen.has(until)) {
            stoppedEarly = true

            break
         }

         // The list is newest first: a connection already stored means every one after it is too.
         if (page.connections.some(({ slug }) => known.has(slug))) {
            stoppedEarly = true
            reachedKnown = true

            break
         }

         if (total !== undefined && seen.size >= total) {
            break
         }

         if (now() - started > READ_LIMIT_MS) {
            stoppedEarly = true

            break
         }

         if (stalled < END_AFTER) {
            await scrollMore()
         }
      }

      // Rows that could not be read are the page's shape changing: the page is kept to read it afterwards.
      if (unreadable) {
         attach('connections-page.html', compactHtml(await hands.html()), 'text/html')
      }

      session.signedIn((await hands.inspect()).url)

      const connections = [...seen.values()].slice(0, MAX_CONNECTIONS)

      return {
         connections,
         ...(total !== undefined && { total }),
         complete: !unreadable && !stoppedEarly && total !== undefined && connections.length >= total,
      }
   }

   // Looks at the page until `done` says so, for as long as the page may take to draw.
   const looks = async (done: (html: string) => boolean, times: number) => {
      for (let look = 0; look < times; look += 1) {
         if (done(await hands.html())) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Looks at the page until an element of `selector` says `words`, and gives its position; -1 when none did in time.
   const lookFor = async (selector: string, words: string, times: number) => {
      for (let look = 0; look < times; look += 1) {
         const at = positionOf(await hands.html(), selector, words)

         if (at >= 0) {
            return at
         }

         await reader.wait(PAUSES.look)
      }

      return -1
   }

   // A step that did not show as it should: the page is kept to read what LinkedIn drew instead.
   const keepPage = async (name: string) => attach(`${name}.html`, compactHtml(await hands.html()), 'text/html')

   // What the dialog asks about: the first name it puts in "Are you sure you want to remove <name> as a connection?".
   const askedAbout = (html: string) => {
      for (const line of parse(html).querySelectorAll(CONNECTION_DIALOG_TEXT)) {
         const [, name] = ASKS.exec(wordsOf(line)) ?? []

         if (name) {
            return name
         }
      }

      return undefined
   }

   // Closes what was opened and leaves the list as it was, so the run ends on a normal page.
   const closeDialog = async () => {
      const cancel = positionOf(await hands.html(), CONNECTION_DIALOG_BUTTON, CANCEL_WORDS)

      if (cancel < 0 || !(await hands.clickNth(CONNECTION_DIALOG_BUTTON, cancel, '', false))) {
         await hands.press('Escape')
      }
   }

   // Removes one connection: the three dots of its row, the menu item, the dialog that must name the same person, and the confirm,
   // pressed once. It stops at the first step that does not show as it should, so nothing is pressed on a guess.
   const removeOne = async (connection: Connection): Promise<ConnectionRemoval['outcome']> => {
      await reader.wait(PAUSES.before)

      if (!(await hands.clickNth(connectionMenuButton(connection.slug), 0, '', true))) {
         log('The three dots of a row could not be pressed')

         return 'NOT_CLICKED'
      }

      const item = await lookFor(CONNECTION_MENU_ITEM, REMOVE_WORDS, MENU_LOOKS)

      if (item < 0) {
         log('The menu of a row did not open')
         await keepPage('removal-menu')
         await hands.press('Escape')

         return 'NOT_CLICKED'
      }

      await reader.wait(PAUSES.step)

      if (!(await hands.clickNth(CONNECTION_MENU_ITEM, item, '', false))) {
         log('The menu item could not be pressed')
         await keepPage('removal-menu')
         await hands.press('Escape')

         return 'NOT_CLICKED'
      }

      if ((await lookFor(CONNECTION_DIALOG_BUTTON, REMOVE_WORDS, MENU_LOOKS)) < 0) {
         log('The dialog of a removal did not open')
         await keepPage('removal-dialog')

         return 'NOT_CLICKED'
      }

      // The dialog must name the person of the row, or nothing is removed.
      const [first] = connection.name.split(' ')
      const dialog = await hands.html()

      if (askedAbout(dialog) !== first) {
         log('The dialog did not name the person that was asked for')
         await keepPage('removal-dialog')
         await closeDialog()

         return 'NOT_CLICKED'
      }

      await reader.wait(PAUSES.before)

      // Asked just before the press that cannot be taken back: a command delivered again after it may have been pressed presses nothing.
      if (!(await markAttempt())) {
         log('This removal was started before')
         repeated = true
         await closeDialog()

         return 'NOT_CLICKED'
      }

      const confirm = positionOf(await hands.html(), CONNECTION_DIALOG_BUTTON, REMOVE_WORDS)

      if (confirm < 0 || !(await hands.clickNth(CONNECTION_DIALOG_BUTTON, confirm, '', false))) {
         log('The confirm button could not be pressed')
         await closeDialog()

         return 'NOT_CLICKED'
      }

      clicked = true
      log('Pressed Remove connection')
      removal = {
         slug: connection.slug,
         outcome: 'UNSURE',
      }

      // The page's own word that LinkedIn took it: the row leaves the list, or the toast says so.
      const left = await looks(html => {
         const page = parseConnections(html)

         return page.connections.every(({ slug }) => slug !== connection.slug) || html.includes('Connection removed.')
      }, CONFIRM_LOOKS)

      return left ? 'REMOVED' : 'UNSURE'
   }

   // The file the importer reads; the verdict never depends on it being handed over.
   const handOver = () => {
      if (!listing) {
         return
      }

      try {
         const { connections, total, complete } = listing

         attach(
            'connections.json',
            JSON.stringify(
               connectionsFileSchema.parse({
                  contract: CONNECTIONS_CONTRACT_VERSION,
                  captured_at: new Date(now()).toISOString(),
                  ...(total !== undefined && { total }),
                  complete,
                  connections,
                  ...(removal && { removal }),
               }),
               null,
               1
            ),
            'application/json'
         )
      } catch {
         warn('The connections could not be handed over.')
      }
   }

   const verdict = (): ConnectionsResult => {
      const counts = {
         read: listing?.connections.length ?? 0,
         ...(removal && { removal: removal.outcome }),
      }

      if (repeated || removal?.outcome === 'UNSURE') {
         return {
            outcome: 'UNKNOWN',
            ...counts,
         }
      }

      // A run that removes one is done when it did; the list it read on the way is not the whole of it.
      const done =
         input.remove === undefined ? listing?.complete === true || reachedKnown : removal?.outcome === 'REMOVED'

      return {
         outcome: done ? 'DONE' : 'PARTIAL',
         ...counts,
      }
   }

   try {
      await session.open(`${baseUrl}${CONNECTIONS_PATH}`)
      log('Opened the connections')
      await reader.wait(PAUSES.open)

      if (!(await settled())) {
         log('The page drew no connections')
         await pause(END_PAUSE_MS)

         return { outcome: 'NOT_DRAWN' }
      }

      listing = await readList(input.remove)
      log(`Read ${listing.connections.length} connections`)

      if (input.remove !== undefined) {
         const connection = listing.connections.find(({ slug }) => slug === input.remove)

         if (!connection) {
            log('The connection was no longer on the list')
            removal = {
               slug: input.remove,
               outcome: 'GONE',
            }
         } else {
            const outcome = await removeOne(connection)

            removal = {
               slug: connection.slug,
               outcome,
            }
         }
      }

      handOver()
      await pause(END_PAUSE_MS)

      return verdict()
   } catch (error) {
      if (error instanceof SignedOut) {
         handOver()

         return { outcome: 'SIGNED_OUT' }
      }

      // Once Remove was pressed, whatever went wrong may have come after it took.
      if (clicked) {
         warn(describeError(error, 'The page could not be read after a removal'))
         handOver()

         return verdict()
      }

      throw error
   }
}
