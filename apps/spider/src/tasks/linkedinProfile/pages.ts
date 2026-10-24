import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { NEVER_CLICK } from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'

export type PageContext = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot'>

export type PageDeps = {
   random?: () => number
   now?: () => number
}

// The page is scrolled down in steps until it stops moving three times, or this many steps, so its lazy parts are drawn.
const MAX_SCROLLS = 25
const SCROLL = [500, 900] as const
export const PAUSES = {
   // After a scroll, and between two pages.
   scroll: [700, 1600],
   between: [4000, 9000],
} as const
// The account's own profile, after LinkedIn sent `/in/me/` on to its address.
const PROFILE_PATH = /^\/in\/([^/]+)\/?$/
// The Interests page has a chip for each kind it holds (a checkbox and its label, recorded 2026-10-24), and only the first is shown;
// the others are opened by a click on their label, which changes nothing on the profile. At most this many after the first.
const INTEREST_TAB = 'input[type="checkbox"] + label'
const MAX_INTEREST_TABS = 4

// What the two tasks that walk the profile (the capture and the reading) do the same way: open the account's own profile, open a page
// of it, scroll a page so its lazy parts are drawn, and go through the chips of Interests.
export const createPages = (
   context: PageContext,
   baseUrl: string,
   { random = Math.random, now = Date.now }: PageDeps = {}
) => {
   const { browser, visit, pause, log } = context
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

   // Scrolls the page down at a person's pace until it stops moving, so what loads as it is scrolled is in the markup.
   const scrollThrough = async () => {
      for (let step = 0, still = 0; step < MAX_SCROLLS && still < 3; step += 1) {
         const moved = await hands.scrollBy(reader.span(SCROLL))

         await reader.wait(PAUSES.scroll)
         still = moved ? 0 : still + 1
      }
   }

   return {
      reader,
      session,
      hands,
      scrollThrough,
      elapsed: reader.elapsed,
      between: () => reader.wait(PAUSES.between),
      html: () => hands.html(),
      // The address of the account's own profile (`.../in/<name>/`), or undefined when `/in/me/` did not lead to a profile.
      openOwn: async () => {
         await session.acceptConsent(await session.open(`${baseUrl}/in/me/`))

         const here = new URL(session.signedIn((await hands.inspect()).url))
         const owner = PROFILE_PATH.exec(here.pathname)?.[1]

         return owner ? `${here.origin}/in/${owner}/` : undefined
      },
      open: (address: string) => session.open(address),
      // Opens each other chip of the Interests page by its label, one after the other, until a click finds no more.
      eachInterestTab: async (visitTab: (tab: number) => Promise<void>) => {
         for (let tab = 1; tab <= MAX_INTEREST_TABS; tab += 1) {
            if (!(await hands.clickNth(INTEREST_TAB, tab, NEVER_CLICK))) {
               return
            }

            await reader.wait(PAUSES.scroll)
            await visitTab(tab)
         }
      },
   }
}
