import {
   INVITES_CONTRACT_VERSION,
   INVITE_LIMITS,
   type InviteInput,
   type InviteSend,
   type InviteSendOutcome,
   type InviteWithdraw,
   type InviteWithdrawOutcome,
   invitesFileSchema,
} from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { compactHtml } from '../../browsing/snapshot'
import {
   moreButtons,
   parseInviteDialog,
   parseProfileActions,
   parseSentInvites,
   withdrawConfirm,
} from '../../linkedin/inviteReader'
import {
   CONNECT_LINK,
   INVITE_BUTTON,
   INVITE_NOTE_BOX,
   INVITE_REQUEST,
   NOTE_UPSELL_DISMISS,
   SENT_INVITES_PATH,
   SENT_ROW,
   SENT_ROW_WITHDRAW,
   WITHDRAW_DIALOG_BUTTON,
   WITHDRAW_REQUEST,
} from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type AnswerWatch } from '../../scraping/driver'
import { type TaskContext } from '../defineTask'
import { kindOf } from '../linkedinLogin/accountValidator'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt'>

type Sent = { id: string; outcome: InviteSendOutcome; memberId?: string }
type Withdrawn = { id: string; outcome: InviteWithdrawOutcome }
// The note window did not come (no free notes left, or no box): nothing was sent, and the invite goes on without the note.
type DialogEnd = InviteSendOutcome | 'NO_NOTE'

// DONE: every invite and withdrawal ended clearly, each sent or settled without a press. PARTIAL: some did not happen (no Connect
// button, a step that did not show, a note refused), and nothing is unclear. UNKNOWN: a press may have landed and the page did not
// say, or the command was delivered again after presses may have been made. LIMIT_REACHED: LinkedIn said the account may not invite
// more now. RESTRICTED: LinkedIn showed its restriction notice. SIGNED_OUT: LinkedIn asked for a sign-in.
export type InviteRun = {
   outcome: 'DONE' | 'PARTIAL' | 'UNKNOWN' | 'LIMIT_REACHED' | 'RESTRICTED' | 'SIGNED_OUT'
   sent: Sent[]
   withdrawn: Withdrawn[]
}

type Deps = {
   random?: () => number
   now?: () => number
}

class Restricted extends Error {}

// Through a slow proxy a profile can take half a minute to draw; the dialog and its answer take a few seconds.
const READY_LOOKS = 20
const DIALOG_LOOKS = 12
// A menu or a button that changes after a press draws within a few seconds.
const MENU_LOOKS = 6
// How far down the Sent list a row is looked for before it is called not pending.
const SENT_SCROLLS = 15
// After Send the page took about 20 s to show Pending (2026-10-30); LinkedIn's answer is looked for that long and a little more.
const CONFIRM_LOOKS = 25
const END_PAUSE_MS = 5000

const PAUSES = {
   open: [2000, 4500],
   look: [900, 1600],
   // As a person looks over a profile before pressing, and between the steps of the dialog.
   before: [2500, 6000],
   step: [800, 1800],
   // Between two invites of a run: the owner's limit, shared with brain through the contract.
   between: [INVITE_LIMITS.gapSeconds.min * 1000, INVITE_LIMITS.gapSeconds.max * 1000],
} as const

const DONE_WITHOUT_PRESS: InviteSendOutcome[] = ['ALREADY_CONNECTED', 'ALREADY_PENDING']

// Sends the invites and withdraws the old ones it is asked for, as the member would (.plan/network-invites.md). Names and notes never
// reach the log; brain's ids and the outcomes go into `invites.json`. Nothing is pressed twice: the run asks `markAttempt` before its
// first press, a command delivered again presses nothing, and it stops at the first press whose outcome the page does not show.
export const runInvites = async (
   context: Context,
   baseUrl: string,
   input: InviteInput,
   { random = Math.random, now = Date.now }: Deps = {}
): Promise<InviteRun> => {
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
   const sent: Sent[] = input.send.map(({ id }) => ({
      id,
      outcome: 'NOT_SENT',
   }))
   const withdrawn: Withdrawn[] = input.withdraw.map(({ id }) => ({
      id,
      outcome: 'NOT_CLICKED',
   }))
   let attempted = false
   let repeated = false
   let stopped = false
   let limited = false
   // The account has no free notes left this month (brain knew, or LinkedIn said so in this run): invites go without their note.
   let notesOut = input.notesOut ?? false
   let kept = 0

   const open = async (url: string) => {
      const landed = await session.open(url)

      if (kindOf(landed) === 'restricted') {
         throw new Restricted()
      }

      await reader.wait(PAUSES.open)

      return session.signedIn((await hands.inspect()).url)
   }

   // Looks at the page until `ready` says yes; the last page read either way.
   const until = async (looks: number, ready: (html: string) => boolean) => {
      let html = await hands.html()

      for (let look = 0; look < looks && !ready(html); look += 1) {
         await reader.wait(PAUSES.look)
         html = await hands.html()
      }

      return html
   }

   // A step that did not show as expected: the page is kept to read what LinkedIn drew (at most a few per run).
   const keepPage = async (name: string) => {
      if (kept < 6) {
         kept += 1
         attach(`${name}-${kept}.html`, compactHtml(await hands.html()), 'text/html')
      }
   }

   // Asked once, just before the first press that may change something on LinkedIn.
   const mayPress = async () => {
      if (attempted) {
         return true
      }

      attempted = true

      if (!(await markAttempt())) {
         log('These invites were started before')
         repeated = true

         return false
      }

      return true
   }

   const pressButton = (index: number) => hands.clickNth(INVITE_BUTTON, index, '', false)

   const closeDialog = async () => {
      await hands.press('Escape')
      await reader.wait(PAUSES.step)
   }

   // LinkedIn's own answer to the invite request (seen 2026-10-30: 200 at once), which comes long before the page shows Pending.
   const answerOf = (watch: AnswerWatch): InviteSendOutcome | undefined => {
      const statuses = watch.statuses()

      if (statuses.some(status => status >= 200 && status < 300)) {
         return 'SENT'
      }

      return statuses.some(status => status >= 400 && status < 500) ? 'REFUSED' : undefined
   }

   // After Send: LinkedIn's answer, its limit notice, or the profile showing Pending (about 20 s later) or no Connect any more.
   const confirmSent = async (invite: InviteSend, watch: AnswerWatch): Promise<InviteSendOutcome> => {
      const settled = (page: string) => {
         const dialog = parseInviteDialog(page)
         const actions = parseProfileActions(page, invite.slug, invite.name)

         return (
            answerOf(watch) !== undefined ||
            dialog.limitReached ||
            (!dialog.open && (actions.connects.length === 0 || actions.pending))
         )
      }
      const html = await until(CONFIRM_LOOKS, settled)
      const answer = answerOf(watch)
      const dialog = parseInviteDialog(html)

      if (dialog.limitReached) {
         await closeDialog()

         return 'LIMIT_REACHED'
      }

      if (answer) {
         return answer
      }

      const actions = parseProfileActions(html, invite.slug, invite.name)

      if (!dialog.open && (actions.connects.length === 0 || actions.pending)) {
         return 'SENT'
      }

      await keepPage('after-send')

      return 'UNSURE'
   }

   // The window the Connect press opened, from its question to Send. Nothing is typed or sent until its buttons show. A layout that
   // sends on Connect alone is told by LinkedIn's answer.
   const throughDialog = async (invite: InviteSend, watch: AnswerWatch, withNote: boolean): Promise<DialogEnd> => {
      const first = parseInviteDialog(
         await until(DIALOG_LOOKS, page => parseInviteDialog(page).open || answerOf(watch) !== undefined)
      )
      const sentAtOnce = answerOf(watch)

      if (sentAtOnce) {
         return sentAtOnce
      }

      if (first.limitReached) {
         await closeDialog()

         return 'LIMIT_REACHED'
      }

      if (first.emailNeeded) {
         await closeDialog()

         return 'EMAIL_NEEDED'
      }

      if (!first.open) {
         log('Connect opened no window')
         await keepPage('no-window')

         return 'NOT_SENT'
      }

      await reader.wait(PAUSES.step)

      if (withNote && invite.note) {
         if (first.addNote < 0 || !(await pressButton(first.addNote))) {
            await keepPage('invite-dialog')
            await closeDialog()

            return 'NOT_SENT'
         }

         const withBox = parseInviteDialog(
            await until(DIALOG_LOOKS, page => {
               const dialog = parseInviteDialog(page)

               return dialog.noteBox || dialog.notesOut
            })
         )

         if (!withBox.noteBox) {
            log(
               withBox.notesOut
                  ? 'LinkedIn has no free notes left for this account'
                  : 'LinkedIn gave no place for the note'
            )
            await keepPage('note')
            notesOut ||= withBox.notesOut

            if (!(await hands.clickSelector(NOTE_UPSELL_DISMISS))) {
               await hands.press('Escape')
            }

            await reader.wait(PAUSES.step)

            return 'NO_NOTE'
         }

         await hands.clickSelector(INVITE_NOTE_BOX)
         await reader.wait(PAUSES.step)

         if (!(await hands.typeKeys(invite.note))) {
            await closeDialog()

            return 'NOT_SENT'
         }

         await reader.wait(PAUSES.step)

         // Send waits for words in the box; still greyed means the words did not land, and nothing is sent.
         const { send, sendDisabled } = parseInviteDialog(
            await until(MENU_LOOKS, page => !parseInviteDialog(page).sendDisabled)
         )

         if (sendDisabled) {
            log('Send stayed greyed after the note was typed')
            await keepPage('note')
            await closeDialog()

            return 'NOT_SENT'
         }

         if (send < 0 || !(await pressButton(send))) {
            await keepPage('invite-dialog')
            await closeDialog()

            return 'NOT_SENT'
         }
      } else if (first.sendWithoutNote < 0 || !(await pressButton(first.sendWithoutNote))) {
         await keepPage('invite-dialog')
         await closeDialog()

         return 'NOT_SENT'
      }

      log('Pressed Send')

      return confirmSent(invite, watch)
   }

   // The person's Connect link is in the page more than once; the first that can be pressed is.
   const pressConnect = async (connects: number[]) => {
      for (const index of connects) {
         if (await hands.clickNth(CONNECT_LINK, index, '', true)) {
            return true
         }
      }

      return false
   }

   // A top card with only Follow, Message and More keeps Connect in the More menu. Opening it changes nothing on LinkedIn. Resolves
   // to the menu's Connect links, or none (the menu is closed again).
   const openMenu = async (invite: InviteSend) => {
      for (const more of moreButtons(await hands.html())) {
         if (!(await pressButton(more))) {
            continue
         }

         const html = await until(
            MENU_LOOKS,
            page => parseProfileActions(page, invite.slug, invite.name).menu.length > 0
         )
         const { menu } = parseProfileActions(html, invite.slug, invite.name)

         if (menu.length > 0) {
            log('Opened the More menu')

            return menu
         }

         await hands.press('Escape')
      }

      return []
   }

   // After the note was refused and its offer dismissed: Send without a note in the window when it is still open, else Connect once
   // more. Add a note and the offer sent nothing (2026-10-31), so this is still the one invite; a Pending already showing means
   // something left that the page did not say, and nothing is pressed.
   const withoutNote = async (invite: InviteSend, watch: AnswerWatch): Promise<DialogEnd> => {
      const html = await until(MENU_LOOKS, page => !parseInviteDialog(page).notesOut)

      if (parseInviteDialog(html).sendWithoutNote >= 0) {
         return throughDialog(invite, watch, false)
      }

      const actions = parseProfileActions(html, invite.slug, invite.name)

      if (actions.pending || answerOf(watch) !== undefined) {
         log('The profile changed before the invite was sent again')

         return 'UNSURE'
      }

      await reader.wait(PAUSES.step)

      const connects = actions.connects.length > 0 ? actions.connects : await openMenu(invite)

      if (!(await pressConnect(connects))) {
         log('The Connect button could not be pressed again')

         return 'NOT_SENT'
      }

      log('Pressed Connect again, to send without the note')

      return throughDialog(invite, watch, false)
   }

   const sendOne = async (invite: InviteSend, index: number) => {
      const landed = await open(`${baseUrl}/in/${invite.slug}/`)

      if (!new URL(landed).pathname.startsWith('/in/')) {
         log('The address did not lead to a profile')
         sent[index] = {
            id: invite.id,
            outcome: 'NOT_AVAILABLE',
         }

         return
      }

      const actions = parseProfileActions(
         await until(READY_LOOKS, page => parseProfileActions(page, invite.slug, invite.name).drawn),
         invite.slug,
         invite.name
      )
      const member = actions.memberId ? { memberId: actions.memberId } : {}

      if (actions.pending) {
         sent[index] = {
            id: invite.id,
            outcome: 'ALREADY_PENDING',
         }

         return
      }

      let { connects } = actions
      let fromMenu = false

      if (connects.length === 0) {
         connects = await openMenu(invite)
         fromMenu = true
      }

      if (connects.length === 0) {
         log('The profile shows no Connect button, nor one in its More menu')
         await keepPage('no-connect')
         sent[index] = {
            id: invite.id,
            outcome: 'NO_CONNECT',
         }

         return
      }

      await reader.wait(PAUSES.before)

      // The Connect press itself may send the invite on some layouts, so it is the first press that counts.
      if (!(await mayPress())) {
         return
      }

      // Listening starts before the press, so LinkedIn's answer to the invite request is not missed.
      const watch = hands.watchAnswers('POST', INVITE_REQUEST)

      try {
         let pressed = await pressConnect(connects)

         // Every copy on the page was out of reach: the one in the More menu is.
         if (!pressed && !fromMenu) {
            pressed = await pressConnect(await openMenu(invite))
         }

         if (!pressed) {
            log('The Connect button could not be pressed')
            sent[index] = {
               id: invite.id,
               outcome: 'NOT_SENT',
               ...member,
            }

            return
         }

         log('Pressed Connect')
         // Until the page says otherwise, the invite may or may not have left.
         sent[index] = {
            id: invite.id,
            outcome: 'UNSURE',
            ...member,
         }

         const withNote = Boolean(invite.note) && !notesOut
         const first = await throughDialog(invite, watch, withNote)
         const end = first === 'NO_NOTE' ? await withoutNote(invite, watch) : first
         // An invite asked with a note that left without it says so; anything short of SENT stays what it was.
         const outcome: InviteSendOutcome =
            end === 'NO_NOTE'
               ? 'NOT_SENT'
               : end === 'SENT' && invite.note && (!withNote || first === 'NO_NOTE')
                 ? 'SENT_WITHOUT_NOTE'
                 : end

         sent[index] = {
            id: invite.id,
            outcome,
            ...member,
         }
      } finally {
         watch.stop()
      }
   }

   // The person's row on the Sent list, scrolling it for more until the row shows or the list stops growing; -1 when it is not there.
   const findSentRow = async (invite: InviteWithdraw) => {
      let rows = -1
      let stalled = 0

      for (let scroll = 0; scroll < SENT_SCROLLS && stalled < 2; scroll += 1) {
         const page = parseSentInvites(await hands.html(), invite.slug)

         if (page.withdraw >= 0) {
            return page.withdraw
         }

         stalled = page.rows === rows ? stalled + 1 : 0
         ;({ rows } = page)

         const pixels = reader.span(PACE.down) + 300

         if (!(await hands.scrollOver(SENT_ROW, pixels))) {
            await hands.scrollBy(pixels)
         }

         await reader.wait(PAUSES.look)
      }

      return -1
   }

   const withdrawOne = async (invite: InviteWithdraw, index: number) => {
      const withdraw = await findSentRow(invite)

      if (withdraw < 0) {
         log('An invite was not on the Sent list')
         await keepPage('sent-list')
         withdrawn[index] = {
            id: invite.id,
            outcome: 'NOT_PENDING',
         }

         return
      }

      await reader.wait(PAUSES.before)

      if (!(await mayPress())) {
         return
      }

      if (!(await hands.clickNth(SENT_ROW_WITHDRAW, withdraw, '', true))) {
         log('The Withdraw link could not be pressed')

         return
      }

      const confirm = withdrawConfirm(await until(DIALOG_LOOKS, page => withdrawConfirm(page) >= 0))

      if (confirm < 0) {
         log('The withdraw window did not open')
         await keepPage('withdraw-dialog')
         await closeDialog()

         return
      }

      await reader.wait(PAUSES.step)

      // Listening starts before the press, so LinkedIn's answer to the withdraw request is not missed.
      const watch = hands.watchAnswers('POST', WITHDRAW_REQUEST)

      try {
         if (!(await hands.clickNth(WITHDRAW_DIALOG_BUTTON, confirm, '', false))) {
            log('The Withdraw button of the window could not be pressed')
            await closeDialog()

            return
         }

         log('Pressed Withdraw')
         withdrawn[index] = {
            id: invite.id,
            outcome: 'UNSURE',
         }

         const gone = (page: string) => withdrawConfirm(page) < 0 && parseSentInvites(page, invite.slug).withdraw < 0
         const html = await until(DIALOG_LOOKS, page => answerOf(watch) !== undefined || gone(page))
         const answer = answerOf(watch)

         if (answer === 'REFUSED') {
            log('LinkedIn refused the withdrawal')
            withdrawn[index] = {
               id: invite.id,
               outcome: 'NOT_CLICKED',
            }
         } else if (answer === 'SENT' || gone(html)) {
            withdrawn[index] = {
               id: invite.id,
               outcome: 'WITHDRAWN',
            }
         } else {
            await keepPage('after-withdraw')
         }
      } finally {
         watch.stop()
      }
   }

   const isUnsure = () =>
      sent.some(({ outcome }) => outcome === 'UNSURE') || withdrawn.some(({ outcome }) => outcome === 'UNSURE')

   // A command delivered again presses nothing; whatever the first delivery did is not known, so every invite and withdrawal of
   // the run is unsure.
   const settleRepeated = () => {
      sent.forEach((item, index) => {
         sent[index] = {
            ...item,
            outcome: DONE_WITHOUT_PRESS.includes(item.outcome) ? item.outcome : 'UNSURE',
         }
      })
      withdrawn.forEach((item, index) => {
         withdrawn[index] = {
            ...item,
            outcome: item.outcome === 'NOT_PENDING' ? item.outcome : 'UNSURE',
         }
      })
   }

   const handOver = () => {
      try {
         attach(
            'invites.json',
            JSON.stringify(
               invitesFileSchema.parse({
                  contract: INVITES_CONTRACT_VERSION,
                  captured_at: new Date(now()).toISOString(),
                  sent,
                  withdrawn,
               }),
               null,
               1
            ),
            'application/json'
         )
      } catch {
         warn('The invites could not be handed over.')
      }
   }

   const result = (outcome?: InviteRun['outcome']): InviteRun => {
      if (repeated) {
         settleRepeated()
      }

      handOver()

      const settled = sent.every(
         ({ outcome: one }) => one === 'SENT' || one === 'SENT_WITHOUT_NOTE' || DONE_WITHOUT_PRESS.includes(one)
      )
      const allWithdrawn = withdrawn.every(({ outcome: one }) => one === 'WITHDRAWN' || one === 'NOT_PENDING')

      return {
         outcome:
            outcome ??
            (repeated || isUnsure()
               ? 'UNKNOWN'
               : limited
                 ? 'LIMIT_REACHED'
                 : settled && allWithdrawn
                   ? 'DONE'
                   : 'PARTIAL'),
         sent,
         withdrawn,
      }
   }

   try {
      if (input.withdraw.length > 0) {
         await open(`${baseUrl}${SENT_INVITES_PATH}`)

         const html = await until(READY_LOOKS, page => parseSentInvites(page, '').rows > 0)

         if (parseSentInvites(html, '').rows === 0) {
            log('The Sent list drew no invite')
            await keepPage('sent-list')
         } else {
            for (const [index, invite] of input.withdraw.entries()) {
               await withdrawOne(invite, index)

               if (repeated || isUnsure()) {
                  stopped = true

                  break
               }

               await reader.wait(PAUSES.step)
            }
         }
      }

      for (const [index, invite] of input.send.entries()) {
         if (stopped) {
            break
         }

         if (index > 0) {
            await reader.wait(PAUSES.between)
         }

         await sendOne(invite, index)

         const { outcome } = sent[index] ?? {}

         // A press that did not end clearly, a repeated command, LinkedIn's limit or a refusal: nothing more is pressed in this run.
         limited = outcome === 'LIMIT_REACHED'
         stopped = repeated || outcome === 'UNSURE' || outcome === 'REFUSED' || limited
      }

      await pause(END_PAUSE_MS)

      return result()
   } catch (error) {
      if (error instanceof SignedOut) {
         return result(isUnsure() ? 'UNKNOWN' : 'SIGNED_OUT')
      }

      if (error instanceof Restricted) {
         return result(isUnsure() ? 'UNKNOWN' : 'RESTRICTED')
      }

      // Once something was pressed, whatever went wrong may have come after it took.
      if (attempted) {
         warn(describeError(error, 'The page could not be read after a press'))

         return result()
      }

      throw error
   }
}
