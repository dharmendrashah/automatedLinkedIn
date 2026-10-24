import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { PACE } from '../../linkedin/pace'
import { parseTopCard } from '../../linkedin/profileReader'
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
const SCROLL_UP = [1500, 2500] as const
export const PAUSES = {
   // After a scroll, and between two pages.
   scroll: [700, 1600],
   between: [4000, 9000],
} as const
// The account's own profile, after LinkedIn sent `/in/me/` on to its address.
const PROFILE_PATH = /^\/in\/([^/]+)\/?$/
// How often the top card is looked for while the address is still `/in/me/`.
const ADDRESS_LOOKS = 5
// The Interests page has a chip for each kind it holds: a radio block that holds a checkbox and its label (recorded 2026-10-24), and
// only the first is shown; the others are opened by a click on their block, which changes nothing on the profile. At most this many
// after the first.
const INTEREST_TAB = '[role="radio"]'
// A chip is a radio over a checkbox, so the usual "never click an input" would refuse it (the second capture clicked none): only real
// buttons and menus are avoided here.
const CHIP_AVOID = 'button, [role="button"], [role="menuitem"], [data-view-name="edge-creation-follow-action"]'
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

   // Scrolls back up with the wheel, in bigger steps, until the page is at its top.
   const scrollToTop = async () => {
      for (let step = 0; step < MAX_SCROLLS; step += 1) {
         await hands.scrollBy(-reader.span(SCROLL_UP))
         await reader.wait(PAUSES.scroll)

         if (!((await hands.inspect()).scrollY > 0)) {
            return
         }
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
      // The address of the account's own profile (`.../in/<name>/`), or undefined when `/in/me/` did not lead to a profile. LinkedIn may
      // keep `/in/me/` in the address bar for a while, and under it the Interests and the activity pages send the browser back to the
      // profile (the fourth capture, 2026-10-24), so the address is then read from the link of the top card's photo.
      openOwn: async () => {
         await session.acceptConsent(await session.open(`${baseUrl}/in/me/`))

         const here = new URL(session.signedIn((await hands.inspect()).url))
         const owner = PROFILE_PATH.exec(here.pathname)?.[1]

         if (owner !== 'me') {
            return owner ? `${here.origin}/in/${owner}/` : undefined
         }

         for (let look = 0; look < ADDRESS_LOOKS; look += 1) {
            const own = parseTopCard(await hands.html())?.profileUrl
            const name = own && URL.canParse(own) ? PROFILE_PATH.exec(new URL(own).pathname)?.[1] : undefined

            if (name) {
               return `${here.origin}/in/${name}/`
            }

            await reader.wait(PAUSES.scroll)
         }

         return `${here.origin}/in/me/`
      },
      open: (address: string) => session.open(address),
      // Opens each other chip of the Interests page by its block, one after the other, until a click finds no more. The chips are at the
      // top of the page, which is out of sight once the page was scrolled to its end, so the wheel takes the page back up to them first
      // (the Home key did nothing in the fourth capture).
      eachInterestTab: async (visitTab: (tab: number) => Promise<void>) => {
         for (let tab = 1; tab <= MAX_INTEREST_TABS; tab += 1) {
            await scrollToTop()

            if (!(await hands.clickNth(INTEREST_TAB, tab, CHIP_AVOID))) {
               return
            }

            await reader.wait(PAUSES.scroll)
            await visitTab(tab)
         }
      },
   }
}
