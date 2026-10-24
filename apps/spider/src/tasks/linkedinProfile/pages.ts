import { parse } from 'node-html-parser'

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

// The page is scrolled down in steps until it stops moving twice, or this many steps, so its lazy parts are drawn.
const MAX_SCROLLS = 25
const STILL_LOOKS = 2
const SCROLL = [500, 900] as const
// The small step up that brings the end of a long list back into view.
const JIGGLE = [700, 1100] as const
// Rounds of up and down at most, how many in a row may bring nothing before the list is taken as complete, and how often the page is
// looked at (one scroll pause apart) for the part that loads.
const MAX_MORE_ROUNDS = 6
const MAX_STALLED_ROUNDS = 3
const MORE_LOOKS = 4
// The first part of a list is 9 to 20 items (recorded 2026-10-24: groups 9 once and 21 another time), while the complete lists seen held 2,
// 4 and 6, so a list of fewer items than this is complete and is not asked for more.
const PART_MIN_ITEMS = 8
export const PAUSES = {
   // After a scroll, and between two pages.
   scroll: [700, 1600],
   between: [2000, 4500],
} as const
// The pages whose lists come in parts (recorded 2026-10-24): skills, and the items of the Interests chips. A list is asked for more
// until it holds this many items, the most the profile file keeps of it (50 for each kind of interest, and for skills).
const LONG_LIST_ITEMS = 50
export const listLimit = (name: string) => (name === 'skills' || name === 'interests' ? LONG_LIST_ITEMS : 0)
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
// A page opens with its title and draws its content a moment later (the page of recommendations given had only its title in the markup
// of one run, 2026-10-24), so a page is looked at, one scroll pause apart, until it holds this many paragraphs in its main block or
// its dialog, at most this many times; a page that is truly bare is then taken as it is.
const DRAWN_PARAGRAPHS = 2
const DRAW_LOOKS = 5
const DRAWN = 'section[aria-label="Primary content"] p, [data-testid="dialog"] p'
// How often a chip is tried before the walk goes on without it.
const CHIP_TRIES = 2

// What the two tasks that walk the profile (the capture and the reading) do the same way: open the account's own profile, open a page
// of it, scroll a page so its lazy parts are drawn, and go through the chips of Interests.
export const createPages = (
   context: PageContext,
   baseUrl: string,
   { random = Math.random, now = Date.now }: PageDeps = {}
) => {
   const { browser, visit, pause, log, screenshot } = context
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

   // A long list loads its next part when its end comes into view again, not while it stays in view (20 skills stayed 20 at the end
   // of the page, and became 30 after a scroll up and down), so the page is scrolled up a little and down again until it stops growing.
   const loadMore = async (limit: number) => {
      const items = async () => parse(await hands.html()).querySelectorAll('[data-testid="lazy-column"] hr').length

      if ((await items()) < PART_MIN_ITEMS) {
         return
      }

      for (let round = 0, stalled = 0; round < MAX_MORE_ROUNDS && stalled < MAX_STALLED_ROUNDS; round += 1) {
         if ((await items()) >= limit) {
            return
         }

         const before = (await hands.html()).length
         const up = reader.span(JIGGLE)
         let grown = false

         await hands.scrollBy(-up)
         await reader.wait(PAUSES.scroll)
         await hands.scrollBy(2 * up)

         for (let look = 0; look < MORE_LOOKS && !grown; look += 1) {
            await reader.wait(PAUSES.scroll)
            grown = (await hands.html()).length > before
         }

         stalled = grown ? 0 : stalled + 1
      }
   }

   // Scrolls the page down at a person's pace until it stops moving, so what loads as it is scrolled is in the markup; a long list is
   // then asked for its next parts.
   const scrollThrough = async (limit = 0) => {
      for (let step = 0, still = 0; step < MAX_SCROLLS && still < STILL_LOOKS; step += 1) {
         const moved = await hands.scrollBy(reader.span(SCROLL))

         await reader.wait(PAUSES.scroll)
         still = moved ? 0 : still + 1
      }

      if (limit > 0) {
         await loadMore(limit)
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
      open: async (address: string) => {
         const opened = await session.open(address)

         for (let look = 0; look < DRAW_LOOKS; look += 1) {
            if (parse(await hands.html()).querySelectorAll(DRAWN).length >= DRAWN_PARAGRAPHS) {
               break
            }

            await reader.wait(PAUSES.scroll)
         }

         return opened
      },
      // Opens each other chip of the Interests page by its block, one after the other, until a click finds no more. The chips are at the
      // top of the page, which is out of sight once its list was scrolled to the end, so the click brings the chip into view itself
      // (the Home key did nothing, and scrolling up by the wheel missed a chip in the sixth reading). A click that finds the chip out of
      // reach is tried once more, and a picture of the page is kept with each miss.
      eachInterestTab: async (visitTab: (tab: number) => Promise<void>) => {
         for (let tab = 1; tab <= MAX_INTEREST_TABS; tab += 1) {
            let clicked = false

            for (let attempt = 0; attempt < CHIP_TRIES && !clicked; attempt += 1) {
               clicked = await hands.clickNth(INTEREST_TAB, tab, CHIP_AVOID, true)

               if (!clicked) {
                  const png = await browser.screenshot?.()

                  log('A chip of Interests was out of reach')

                  if (png) {
                     await screenshot(`interests-chip-${tab}-missed`, png)
                  }
               }
            }

            if (!clicked) {
               return
            }

            await reader.wait(PAUSES.scroll)
            await visitTab(tab)
         }
      },
   }
}
