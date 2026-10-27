import {
   INVITATIONS_CONTRACT_VERSION,
   INVITATION_LIMITS,
   type Invitation,
   type InvitationAction,
   type InvitationOutcome,
   MAX_INVITATIONS,
   invitationsFileSchema,
} from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { parseInvitations } from '../../linkedin/invitationReader'
import { INVITATIONS_PATH, INVITATION_ROW, invitationButton } from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt'>

export type InvitationsInput = {
   // The requests to answer, in this order; none reads the list only.
   answers: Array<{ id: string; action: InvitationAction }>
}

// DONE: the list was read and every answer asked for took. PARTIAL: it was read, but part of it was not (a request that was gone, an
// answer not reached, a list that held more). UNKNOWN: a click may have landed and the page does not say, or the command was
// delivered again after clicks may have been made, so nothing was clicked. NOT_DRAWN: the page showed no request and did not say
// there are none. SIGNED_OUT: LinkedIn asked for a sign-in.
export type InvitationsResult =
   | { outcome: 'SIGNED_OUT' | 'NOT_DRAWN' }
   | {
        outcome: 'DONE' | 'PARTIAL' | 'UNKNOWN'
        read: number
        asked: number
        answered: number
     }

type Deps = {
   random?: () => number
   now?: () => number
}

type Listing = {
   invitations: Invitation[]
   total?: number
   complete: boolean
}

// How many times the page is looked at for its requests before it is called empty (through a proxy a page can take half a minute),
// how many times it is scrolled for more, and how many scrolls in a row that bring nothing new are the end of the list.
const READY_LOOKS = 20
const MAX_SCROLLS = 40
const END_AFTER = 2
// How many looks follow a click for the request to leave the page, and how many scrolls bring the top of the list back.
const CONFIRM_LOOKS = 12
const TOP_SCROLLS = 15
const TOP_PIXELS = 1500
// The page stays open this long once it has been read and answered, so the last picture and the video end on a settled page.
const END_PAUSE_MS = 5000

const PAUSES = {
   // The page drawing after it opened, and between two looks at it.
   open: [2000, 4500],
   look: [900, 1600],
   // After a scroll for more rows.
   more: [1200, 2600],
   // As a person looks over a request before pressing.
   before: [800, 1800],
   // Between two answers: the owner's limit, shared with brain and the page through the contract.
   between: [INVITATION_LIMITS.gapSeconds.min * 1000, INVITATION_LIMITS.gapSeconds.max * 1000],
} as const

// Reads the received connection requests as the member sees them on the page that lists them all, and answers the ones asked for,
// one at a time at a person's pace (.plan/my-network-invitations.md). Names, headlines and notes never reach the log; they go only
// into `invitations.json`. A request is never answered twice: a command delivered again after a click may have landed clicks nothing.
export const runInvitations = async (
   context: Context,
   baseUrl: string,
   input: InvitationsInput,
   { random = Math.random, now = Date.now }: Deps = {}
): Promise<InvitationsResult> => {
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
   const outcomes: InvitationOutcome[] = input.answers.map(({ id, action }) => ({
      id,
      action,
      outcome: 'NOT_CLICKED',
   }))
   let listing: Listing | undefined
   let clicked = false
   let repeated = false

   const idsOnPage = async () => new Set(parseInvitations(await hands.html()).invitations.map(({ id }) => id))

   // Looks at the page until it draws requests, or says it has none; a page that does neither is not called empty.
   const settled = async () => {
      for (let look = 0; look < READY_LOOKS; look += 1) {
         const page = parseInvitations(await hands.html())

         if (page.rows > 0 || page.empty || page.total === 0) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Scrolls the list over its own rows, so the pane that holds them moves; the page itself when there is no such pane.
   const scrollMore = async () => {
      const pixels = reader.span(PACE.down) + 300

      if (!(await hands.scrollOver(INVITATION_ROW, pixels))) {
         await hands.scrollBy(pixels)
      }

      await reader.wait(PAUSES.more)
   }

   // Every request the page draws, scrolling for more until the list stops growing. Rows are kept as they were first seen: a long list
   // may draw only the rows near the window.
   const readList = async (): Promise<Listing> => {
      const seen = new Map<string, Invitation>()
      let total: number | undefined
      let unreadable = false
      let stalled = 0

      for (
         let scrolls = 0;
         scrolls <= MAX_SCROLLS && stalled < END_AFTER && seen.size < MAX_INVITATIONS;
         scrolls += 1
      ) {
         const page = parseInvitations(await hands.html())
         const before = seen.size

         total = page.total ?? total
         unreadable ||= page.rows > page.invitations.length
         page.invitations.forEach(invitation => seen.set(invitation.id, seen.get(invitation.id) ?? invitation))
         stalled = seen.size > before ? 0 : stalled + 1

         // The page says there is none: nothing to scroll for.
         if (page.empty) {
            break
         }

         if (total !== undefined && seen.size >= total) {
            break
         }

         if (stalled < END_AFTER) {
            await scrollMore()
         }
      }

      session.signedIn((await hands.inspect()).url)

      const invitations = [...seen.values()].slice(0, MAX_INVITATIONS)

      return {
         invitations,
         ...(total !== undefined && { total }),
         complete: !unreadable && seen.size < MAX_INVITATIONS && (total === undefined || invitations.length >= total),
      }
   }

   // Brings the top of the list back into the window, since the rows are answered in the order they were asked for, from the top.
   const toTop = async (firstId: string | undefined) => {
      for (let scrolls = 0; scrolls < TOP_SCROLLS; scrolls += 1) {
         if (!firstId || (await idsOnPage()).has(firstId)) {
            return
         }

         await hands.scrollBy(-TOP_PIXELS)
         await reader.wait(PAUSES.look)
      }
   }

   // Whether the request leaves the page after it was answered, which is the page's own word that LinkedIn took the answer.
   const left = async (id: string) => {
      for (let look = 0; look < CONFIRM_LOOKS; look += 1) {
         await reader.wait(PAUSES.look)

         if (!(await idsOnPage()).has(id)) {
            return true
         }
      }

      return false
   }

   // Answers the requests in order. It stops at the first one that does not end clearly, so a problem is not repeated on the next.
   const answerAll = async () => {
      for (const [index, ask] of input.answers.entries()) {
         if (!(await idsOnPage()).has(ask.id)) {
            log('A request was no longer on the page')
            outcomes[index] = {
               ...ask,
               outcome: 'GONE',
            }

            continue
         }

         // Asked just before the first click: a command delivered again after a click may have landed clicks nothing.
         if (!clicked && !(await markAttempt())) {
            log('These answers were started before')
            repeated = true

            return
         }

         await reader.wait(clicked ? PAUSES.between : PAUSES.before)

         if (!(await hands.clickNth(invitationButton(ask.id, ask.action), 0, '', true))) {
            log('The button of a request could not be clicked')

            return
         }

         clicked = true
         log(`Pressed ${ask.action === 'ACCEPT' ? 'Accept' : 'Ignore'}`)
         // Until the page says otherwise, the answer may or may not have taken.
         outcomes[index] = {
            ...ask,
            outcome: 'UNSURE',
         }

         if (!(await left(ask.id))) {
            log('The request stayed on the page')

            return
         }

         outcomes[index] = {
            ...ask,
            outcome: ask.action === 'ACCEPT' ? 'ACCEPTED' : 'IGNORED',
         }
      }
   }

   // The file the importer reads; the verdict never depends on it being handed over.
   const handOver = () => {
      if (!listing) {
         return
      }

      try {
         const { invitations, total, complete } = listing

         attach(
            'invitations.json',
            JSON.stringify(
               invitationsFileSchema.parse({
                  contract: INVITATIONS_CONTRACT_VERSION,
                  captured_at: new Date(now()).toISOString(),
                  ...(total !== undefined && { total }),
                  complete,
                  invitations,
                  outcomes,
               }),
               null,
               1
            ),
            'application/json'
         )
      } catch {
         warn('The requests could not be handed over.')
      }
   }

   const verdict = (): InvitationsResult => {
      const answered = outcomes.filter(({ outcome }) => outcome === 'ACCEPTED' || outcome === 'IGNORED').length
      const counts = {
         read: listing?.invitations.length ?? 0,
         asked: outcomes.length,
         answered,
      }

      if (repeated || outcomes.some(({ outcome }) => outcome === 'UNSURE')) {
         return {
            outcome: 'UNKNOWN',
            ...counts,
         }
      }

      return {
         outcome: answered === outcomes.length && listing?.complete === true ? 'DONE' : 'PARTIAL',
         ...counts,
      }
   }

   try {
      await session.open(`${baseUrl}${INVITATIONS_PATH}`)
      log('Opened the connection requests')
      await reader.wait(PAUSES.open)

      if (!(await settled())) {
         log('The page drew no connection requests')
         await pause(END_PAUSE_MS)

         return { outcome: 'NOT_DRAWN' }
      }

      listing = await readList()
      log(`Read ${listing.invitations.length} connection requests`)

      if (outcomes.length > 0) {
         await toTop(listing.invitations[0]?.id)
         await answerAll()

         // What is left of the list, as the page shows it now; the first read stands when the page cannot be read again.
         try {
            listing = await readList()
         } catch (error) {
            if (error instanceof SignedOut) {
               throw error
            }

            warn(describeError(error, 'The list could not be read again'))
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

      // Once a click was made, whatever went wrong may have come after the answer took.
      if (clicked) {
         warn(describeError(error, 'The page could not be read after an answer'))
         handOver()

         return verdict()
      }

      throw error
   }
}
