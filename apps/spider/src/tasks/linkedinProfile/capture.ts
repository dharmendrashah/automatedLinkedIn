import { StepFailed, describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import { NEVER_CLICK } from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot'>

// The pages behind the profile's "Show all" links, by the address they have under the profile's own address. The names are the
// names of the kept files. Nothing here is clicked: each page is opened by its address, as a person could type it.
export const DETAIL_PAGES = [
   {
      name: 'experience',
      path: 'details/experience/',
   },
   {
      name: 'education',
      path: 'details/education/',
   },
   {
      name: 'projects',
      path: 'details/projects/',
   },
   {
      name: 'skills',
      path: 'details/skills/',
   },
   {
      name: 'recommendations-received',
      path: 'details/recommendations/',
   },
   {
      name: 'recommendations-given',
      path: 'details/recommendations/?detailScreenTabIndex=1',
   },
   {
      name: 'languages',
      path: 'details/languages/',
   },
   {
      name: 'interests',
      path: 'details/interests/',
   },
   {
      name: 'posts',
      path: 'recent-activity/all/',
   },
   {
      name: 'comments',
      path: 'recent-activity/comments/',
   },
] as const

// DONE: the profile and every detail page were kept. PARTIAL: some pages were not (they would not open, or the time ran out).
// NOT_OPENED: the address of the account's own profile did not lead to a profile. SIGNED_OUT: LinkedIn asked for a sign-in.
export type ProfileCapture = {
   outcome: 'DONE' | 'PARTIAL' | 'NOT_OPENED' | 'SIGNED_OUT'
   // Pages kept, the profile itself included, and detail pages that were not.
   pages: number
   missed: number
}

type Deps = {
   random?: () => number
   now?: () => number
}

// No new page is begun after this much of the run; the time limit of the task is longer, so the one in progress can end.
export const BUDGET_MS = 10 * 60 * 1000
// After this many pages in a row that did not open the run stops: something is wrong.
const MAX_FAILURES_IN_A_ROW = 3
// The page is scrolled down in steps until it stops moving three times, or this many steps, so its lazy parts are drawn.
const MAX_SCROLLS = 25
const SCROLL = [500, 900] as const
const PAUSES = {
   // After a scroll, and between two pages.
   scroll: [700, 1600],
   between: [4000, 9000],
} as const
// The Interests page has a chip for each kind it holds (a checkbox and its label, recorded 2026-10-24), and only the first is shown;
// the others are opened by a click on their label, which changes nothing on the profile. At most this many after the first.
const INTEREST_TAB = 'input[type="checkbox"] + label'
const MAX_INTEREST_TABS = 4
// The account's own profile, after LinkedIn sent `/in/me/` on to its address.
const PROFILE_PATH = /^\/in\/([^/]+)\/?$/

// Capture step of the profile task (.plan/linkedin-profile-task.md): it opens the account's own profile and the pages behind its
// "Show all" links, scrolls each down so its lazy parts are drawn, and keeps every page (markup, links and a picture) with the run,
// so the readers can be written from the real pages. It reads nothing and clicks nothing. The address of the profile never reaches
// the log, because it holds the owner's name.
export const captureProfile = async (context: Context, baseUrl: string, deps: Deps = {}): Promise<ProfileCapture> => {
   const { random = Math.random, now = Date.now } = deps
   const { browser, visit, pause, log, warn } = context
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
   // A run keeps at most 20 files: the profile keeps its markup and its links and controls, each detail page only its markup.
   const keep = createKeep(context, true)
   const keepLean = createKeep(context, true, undefined, false)
   let kept = 0

   // Scrolls the page down at a person's pace until it stops moving, so what loads as it is scrolled is in the markup.
   const scrollThrough = async () => {
      for (let step = 0, still = 0; step < MAX_SCROLLS && still < 3; step += 1) {
         const moved = await hands.scrollBy(reader.span(SCROLL))

         await reader.wait(PAUSES.scroll)
         still = moved ? 0 : still + 1
      }
   }

   const keepPage = async (name: string, lean = true) => {
      await scrollThrough()
      await (lean ? keepLean : keep)(name)
      kept += 1
   }

   const missed = (done: number) => DETAIL_PAGES.length - done

   // The other chips of the Interests page, one page kept for each, until a click finds no more.
   const keepInterestTabs = async () => {
      for (let tab = 1; tab <= MAX_INTEREST_TABS; tab += 1) {
         if (!(await hands.clickNth(INTEREST_TAB, tab, NEVER_CLICK))) {
            return
         }

         await reader.wait(PAUSES.scroll)
         await keepPage(`detail-interests-${tab + 1}`)
      }
   }

   try {
      await session.acceptConsent(await session.open(`${baseUrl}/in/me/`))

      const here = new URL(session.signedIn((await hands.inspect()).url))
      const owner = PROFILE_PATH.exec(here.pathname)?.[1]

      if (!owner) {
         log('The account’s own profile did not open')
         await keep('profile-not-opened')

         return {
            outcome: 'NOT_OPENED',
            pages: 0,
            missed: DETAIL_PAGES.length,
         }
      }

      log('Opened the profile')
      await keepPage('profile', false)

      const profile = `${here.origin}/in/${owner}/`
      const done = await runTargets({
         targets: [...DETAIL_PAGES],
         step: async ({ name, path }) => {
            await session.open(`${profile}${path}`)
            await keepPage(`detail-${name}`)
            log(`Kept the page of ${name}`)

            if (name === 'interests') {
               await keepInterestTabs()
            }

            return true
         },
         recover: () => Promise.resolve(),
         between: () => reader.wait(PAUSES.between),
         elapsed: reader.elapsed,
         budgetMs: BUDGET_MS,
         maxFailuresInARow: MAX_FAILURES_IN_A_ROW,
         isFatal: error => error instanceof SignedOut,
         warn,
         says: {
            stepStopped: 'A page of the profile did not open',
            notRecovered: 'The profile could not be opened again',
         },
      })

      return {
         outcome: done === DETAIL_PAGES.length ? 'DONE' : 'PARTIAL',
         pages: kept,
         missed: missed(done),
      }
   } catch (error) {
      if (error instanceof SignedOut) {
         return {
            outcome: 'SIGNED_OUT',
            pages: kept,
            missed: missed(Math.max(0, kept - 1)),
         }
      }

      if (error instanceof StepFailed) {
         warn(describeError(error, 'The profile could not be opened'))

         return {
            outcome: 'NOT_OPENED',
            pages: kept,
            missed: DETAIL_PAGES.length,
         }
      }

      throw error
   }
}
