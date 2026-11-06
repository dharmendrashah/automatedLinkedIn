import {
   ENGAGE_LIMITS,
   type EngageActInput,
   type EngageInput,
   type EngageOutcome,
   REACTION_LABELS,
   type Reaction,
   engagePostOf,
   engageShareLinkOf,
} from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import {
   REPOST_MENU,
   activityKeyOf,
   commentBoxOf,
   commentsSaying,
   composerOn,
   pickerShows,
   postIsOn,
   reactionStateOf,
   replyPlaceOf,
   repostMenuIndexOf,
   repostSubmitIndexOf,
   repostedOn,
   submitEnabled,
} from '../../linkedin/engageReader'
import {
   ENGAGE_AVOID,
   ENGAGE_BUTTONS,
   ENGAGE_EDITOR,
   ENGAGE_PICKER_CHOICE,
   ENGAGE_PICKER_OPEN,
   ENGAGE_REPLY_OPEN,
   ENGAGE_REPOST_MENU,
   ENGAGE_REPOST_OPEN,
   ENGAGE_STATE,
   ENGAGE_SUBMIT,
   POST_EDITOR,
   POST_PAGE,
} from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext, VisitError } from '../defineTask'
import { kindOf } from '../linkedinLogin/accountValidator'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'markAttempt'>

type Deps = {
   random?: () => number
   now?: () => number
}

export type Stop = 'SIGNED_OUT' | 'RESTRICTED' | 'ERROR'

export type EngageRun = {
   // The verdict when the run stopped early, or DONE, PARTIAL or NONE_DONE from the outcomes.
   verdict: 'DONE' | 'PARTIAL' | 'NONE_DONE' | Stop
   acts: Array<{ id: string; outcome: EngageOutcome }>
}

// An outcome that means LinkedIn shows the act as made.
export const DONE_OUTCOMES: EngageOutcome[] = ['REACTED', 'COMMENTED', 'REPOSTED', 'REPLIED', 'ALREADY_REACTED']

// How many looks at a post (one pause apart) until it has drawn: through a slow proxy it can take half a minute.
const DRAW_LOOKS = 20
// Looks for the Comment button to come alive once the words are in, for the reaction to show after a press, and for the comment to show.
const ENABLE_LOOKS = 12
const STATE_LOOKS = 6
const SHOW_LOOKS = 12
// Looks for the reaction popover, the Repost menu and the compose page after a press that opens them.
const PICKER_LOOKS = 4
const MENU_LOOKS = 6
const COMPOSE_LOOKS = 10
// How many times a place is pressed while the page is still drawing it.
const CLICK_TRIES = 3
// How many looks at a post for its comment box, which can draw after the post does.
const BOX_LOOKS = 10

const PAUSES = {
   look: [900, 1600],
   click: [600, 1400],
   typed: [800, 2000],
   posted: [1200, 2400],
   settle: [2000, 5000],
} as const

// The rest between two acts of a run, in milliseconds.
const GAP = [ENGAGE_LIMITS.gapSeconds.min * 1000, ENGAGE_LIMITS.gapSeconds.max * 1000] as const

// The page of an account that LinkedIn restricted (the restriction notice is a page of its own).
class Restricted extends Error {}

// Set just before a step that must not be repeated: `attempted` says the step may already have been taken.
type Progress = { attempted: boolean }

// Makes each act of a run in turn as the signed-in member does: opens the post, checks it is the one asked for, presses the reaction
// (or types the words and presses Comment), and confirms the page shows it. Nothing is pressed twice: an act whose outcome is unclear is
// UNKNOWN and is never retried. The words never reach the log.
export const runEngage = async (
   context: Context,
   baseUrl: string,
   input: EngageInput,
   { random = Math.random, now = Date.now }: Deps = {}
): Promise<EngageRun> => {
   const { browser, visit, pause, log, markAttempt } = context
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

   // The page as it is once `done` holds, or as it is after the last look when it never does.
   const lookAt = async (looks: number, done: (html: string) => boolean) => {
      let html = await hands.html()

      for (let look = 0; look < looks && !done(html); look += 1) {
         await reader.wait(PAUSES.look)
         html = await hands.html()
      }

      return html
   }

   // Asked just before the step that cannot be taken back. False when this command was delivered again after it may have been taken.
   const askAttempt = async (progress: Progress) => {
      progress.attempted = true

      return markAttempt()
   }

   const clearBox = async () => {
      await hands.press('ControlOrMeta+A')
      await hands.press('Delete')
   }

   // A place of a control, brought into view first: a control below the fold is not reached by a plain click.
   const pressAt = (selector: string, index: number) => hands.clickNth(selector, index, ENGAGE_AVOID, true)
   const pressFirst = (selector: string) => pressAt(selector, 0)

   // Presses a place that the page may still be drawing, a few times at most.
   const clickUntil = async (selector: string) => {
      for (let attempt = 0; attempt < CLICK_TRIES; attempt += 1) {
         if (await pressFirst(selector)) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Opens the post; a page that does not open is left out of the run, and a sign-in page stops it.
   const openPost = async (link: string) => {
      try {
         return await session.open(link)
      } catch (error) {
         if (error instanceof VisitError) {
            log('A post did not open')

            return undefined
         }

         throw error
      }
   }

   // Opens the reaction popover and checks that it offers this reaction. Nothing is attempted when it does not open.
   const openPicker = async (label: string, html: string) => {
      if (!pickerShows(html, label) && !(await pressFirst(ENGAGE_PICKER_OPEN))) {
         return false
      }

      return pickerShows(await lookAt(PICKER_LOOKS, page => pickerShows(page, label)), label)
   }

   const reactOn = async (reaction: Reaction, html: string, progress: Progress): Promise<EngageOutcome> => {
      const state = reactionStateOf(html)

      if (state === undefined) {
         log('The post shows no reaction control')

         return 'NOT_TRIED'
      }

      if (state !== 'no reaction') {
         return 'ALREADY_REACTED'
      }

      // A plain press on the control is Like; any other reaction is picked from the popover, which must show it first.
      const label = REACTION_LABELS[reaction]

      if (reaction !== 'like' && !(await openPicker(label, html))) {
         return 'NOT_TRIED'
      }

      if (!(await askAttempt(progress))) {
         return 'UNKNOWN'
      }

      const pressed =
         reaction === 'like' ? await pressFirst(ENGAGE_STATE) : await pressFirst(ENGAGE_PICKER_CHOICE(label))

      if (!pressed) {
         return 'NOT_TRIED'
      }

      const shown = await lookAt(STATE_LOOKS, page => reactionStateOf(page) === label)

      return reactionStateOf(shown) === label ? 'REACTED' : 'UNKNOWN'
   }

   const commentOn = async (text: string, progress: Progress): Promise<EngageOutcome> => {
      // The box can draw after the post does, so it is waited for before the post is said to have none.
      const boxed = await lookAt(BOX_LOOKS, page => commentBoxOf(page) !== undefined)

      if (commentBoxOf(boxed) === undefined) {
         return 'COMMENTS_OFF'
      }

      if (!(await clickUntil(ENGAGE_EDITOR))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.click)

      if (!(await hands.typeKeys(text))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.typed)

      if (!submitEnabled(await lookAt(ENABLE_LOOKS, submitEnabled))) {
         await clearBox()

         return 'NOT_TRIED'
      }

      const before = commentsSaying(await hands.html(), text)

      if (!(await askAttempt(progress))) {
         await clearBox()

         return 'UNKNOWN'
      }

      if (!(await pressFirst(ENGAGE_SUBMIT))) {
         await clearBox()

         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.posted)

      const shown = await lookAt(SHOW_LOOKS, page => commentsSaying(page, text) > before)
      const cleared = commentBoxOf(shown)?.words === ''

      return commentsSaying(shown, text) > before && cleared ? 'COMMENTED' : 'UNKNOWN'
   }

   // Opens the Repost menu and takes its "Repost with thoughts" item, writes the words on the compose page, presses its Repost, and
   // checks LinkedIn says it went. Opening the menu and the compose page change nothing on LinkedIn, so they come before the attempt.
   const repostOn = async (text: string, progress: Progress): Promise<EngageOutcome> => {
      if (!(await pressFirst(ENGAGE_REPOST_OPEN))) {
         return 'NOT_TRIED'
      }

      const item = repostMenuIndexOf(await lookAt(MENU_LOOKS, page => repostMenuIndexOf(page) >= 0))

      if (item < 0 || !(await hands.clickNth(ENGAGE_REPOST_MENU, item, ENGAGE_AVOID))) {
         return 'NOT_TRIED'
      }

      session.signedIn((await hands.inspect()).url)

      if (!composerOn(await lookAt(COMPOSE_LOOKS, composerOn)) || !(await clickUntil(POST_EDITOR))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.click)

      if (!(await hands.typeKeys(text))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.typed)

      const submit = repostSubmitIndexOf(await lookAt(ENABLE_LOOKS, page => repostSubmitIndexOf(page) >= 0))

      if (submit < 0) {
         await clearBox()

         return 'NOT_TRIED'
      }

      if (!(await askAttempt(progress))) {
         await clearBox()

         return 'UNKNOWN'
      }

      if (!(await hands.clickNth(ENGAGE_BUTTONS, submit, ENGAGE_AVOID))) {
         await clearBox()

         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.posted)

      return repostedOn(await lookAt(SHOW_LOOKS, repostedOn)) ? 'REPOSTED' : 'UNKNOWN'
   }

   // Presses Repost instantly from the Repost menu: nothing is typed, and the alert is the check. The attempt is marked just before that press.
   const repostInstantOn = async (progress: Progress): Promise<EngageOutcome> => {
      if (!(await pressFirst(ENGAGE_REPOST_OPEN))) {
         return 'NOT_TRIED'
      }

      const item = repostMenuIndexOf(
         await lookAt(MENU_LOOKS, page => repostMenuIndexOf(page, REPOST_MENU.instantly) >= 0),
         REPOST_MENU.instantly
      )

      if (item < 0) {
         return 'NOT_TRIED'
      }

      if (!(await askAttempt(progress))) {
         return 'UNKNOWN'
      }

      if (!(await hands.clickNth(ENGAGE_REPOST_MENU, item, ENGAGE_AVOID))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.posted)

      return repostedOn(await lookAt(SHOW_LOOKS, repostedOn)) ? 'REPOSTED' : 'UNKNOWN'
   }

   // Presses Reply on a comment, types the words after the name the reply box opens with, and presses that reply's Reply once.
   const replyOn = async (commentId: string, text: string, progress: Progress): Promise<EngageOutcome> => {
      const place = replyPlaceOf(await hands.html(), commentId)

      if (place === undefined) {
         return 'COMMENT_GONE'
      }

      // A reply box already open after this comment: nothing is typed into it.
      if (place.editor !== undefined) {
         log('Another reply box is open on the post')

         return 'NOT_TRIED'
      }

      if (!(await pressAt(ENGAGE_REPLY_OPEN, place.reply))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.click)

      const opened = await lookAt(ENABLE_LOOKS, page => replyPlaceOf(page, commentId)?.editor !== undefined)
      const box = replyPlaceOf(opened, commentId)?.editor

      if (box === undefined || !(await pressAt(ENGAGE_EDITOR, box))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.click)
      // The box opens with the name of the person replied to: the words go after it.
      await hands.press('ControlOrMeta+End')

      if (!(await hands.typeKeys(text))) {
         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.typed)

      const ready = await lookAt(ENABLE_LOOKS, page => replyPlaceOf(page, commentId)?.submit !== undefined)
      const submit = replyPlaceOf(ready, commentId)?.submit

      if (submit === undefined) {
         await clearBox()

         return 'NOT_TRIED'
      }

      const before = commentsSaying(ready, text)

      if (!(await askAttempt(progress))) {
         await clearBox()

         return 'UNKNOWN'
      }

      if (!(await pressAt(ENGAGE_BUTTONS, submit))) {
         await clearBox()

         return 'NOT_TRIED'
      }

      await reader.wait(PAUSES.posted)

      const shown = await lookAt(SHOW_LOOKS, page => commentsSaying(page, text) > before)

      return commentsSaying(shown, text) > before ? 'REPLIED' : 'UNKNOWN'
   }

   const actOn = async (act: EngageActInput, progress: Progress): Promise<EngageOutcome> => {
      const post = engagePostOf(act.postUrl)
      const link = post?.link ?? engageShareLinkOf(act.postUrl)
      const landed = link === null || link === undefined ? undefined : await openPost(link)

      if (link === null || link === undefined || landed === undefined) {
         return 'NOT_TRIED'
      }

      if (kindOf(landed) === 'restricted') {
         throw new Restricted()
      }

      if (kindOf(landed) !== 'consent' && !POST_PAGE.test(new URL(landed).pathname)) {
         log('The address did not lead to a post')

         return 'POST_GONE'
      }

      await session.acceptConsent(landed)

      // A share address has no post key of its own: the key is the post's activity key on the page it opens.
      const keyOn = (page: string) => post?.key ?? activityKeyOf(page)
      const html = await lookAt(DRAW_LOOKS, page => {
         const key = keyOn(page)

         return key !== undefined && postIsOn(page, key, act.authorName)
      })
      const key = keyOn(html)

      if (key === undefined || !postIsOn(html, key, act.authorName)) {
         log('The address did not open the post that was asked for')

         return 'POST_GONE'
      }

      if (act.kind === 'comment_reply') {
         return act.text === undefined || act.commentId === undefined
            ? 'NOT_TRIED'
            : replyOn(act.commentId, act.text, progress)
      }

      if (act.kind === 'repost_instant') {
         return repostInstantOn(progress)
      }

      if (act.kind === 'repost') {
         return act.text === undefined ? 'NOT_TRIED' : repostOn(act.text, progress)
      }

      if (act.kind === 'comment') {
         return act.text === undefined ? 'NOT_TRIED' : commentOn(act.text, progress)
      }

      return act.reaction === undefined ? 'NOT_TRIED' : reactOn(act.reaction, html, progress)
   }

   const results: EngageRun['acts'] = []
   let stop: Stop | undefined

   for (const [index, act] of input.acts.entries()) {
      if (index > 0) {
         await reader.wait(GAP)
      }

      const progress: Progress = { attempted: false }

      try {
         results.push({
            id: act.id,
            outcome: await actOn(act, progress),
         })

         // Left after a short settle, so the page keeps what the act did before the run moves on.
         await reader.wait(PAUSES.settle)
      } catch (error) {
         // A step taken before the failure is UNKNOWN; one not reached is NOT_TRIED.
         results.push({
            id: act.id,
            outcome: progress.attempted ? 'UNKNOWN' : 'NOT_TRIED',
         })

         if (error instanceof SignedOut) {
            stop = 'SIGNED_OUT'
         } else if (error instanceof Restricted) {
            stop = 'RESTRICTED'
         } else {
            context.warn(describeError(error, 'The act could not be finished'))
            stop = 'ERROR'
         }

         break
      }
   }

   for (const { id } of input.acts.slice(results.length)) {
      results.push({
         id,
         outcome: 'NOT_TRIED',
      })
   }

   const doneCount = results.filter(({ outcome }) => DONE_OUTCOMES.includes(outcome)).length
   const verdict = stop ?? (doneCount === results.length ? 'DONE' : doneCount > 0 ? 'PARTIAL' : 'NONE_DONE')

   return {
      verdict,
      acts: results,
   }
}
