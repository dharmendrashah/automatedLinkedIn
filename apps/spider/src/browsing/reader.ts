import { type InspectedElement } from '../scraping/driver'
import { type Hands } from './hands'
import { type Range, between } from './random'

// How a person moves about a page: how far one scroll goes down and up, and how long they pause after a move.
export type Pace = {
   down: Range
   up: Range
   read: Range
   glance: Range
   linger: Range
}

type Deps = {
   hands: Hands
   pause: (ms: number) => Promise<void>
   random: () => number
   now: () => number
   pace: Pace
}

// A guard against a run that makes no progress in time (a stopped clock): no stay lasts more than this many small moves.
const MAX_BEATS = 120
// How far down the window an element is brought when the page is scrolled to it, as a fraction of the window's height.
const BRING_TO = 0.35
// The most and the least a single scroll toward an element goes.
const SCROLL_TO = {
   min: 150,
   max: 900,
}

// A person on a page: the small moves of reading, and the time they take. It knows nothing of the site, so a task of any site
// can use it; the clock starts when it is made, so `elapsed` is the age of the run.
export const createReader = ({ hands, pause, random, now, pace }: Deps) => {
   const begin = now()
   const elapsed = () => now() - begin
   const span = (range: Range) => between(range[0], range[1], random)
   const wait = (range: Range) => pause(span(range))

   // One small move of a hand on a page: read on, look back up, let the pointer rest or drift, or just stay a while.
   const beat = async () => {
      const roll = random()

      if (roll < 0.62) {
         await hands.scrollBy(span(pace.down))
         await wait(pace.read)
      } else if (roll < 0.74) {
         await hands.scrollBy(-span(pace.up))
         await wait([800, 2500])
      } else if (roll < 0.84) {
         await hands.drift()
         await wait(pace.glance)
      } else {
         await wait(pace.linger)
      }
   }

   // Stays about this long where it is, in small moves. With `expand` (the selector of a "more" control) it also opens the rest
   // of a long text, once.
   const dwell = async (range: Range, expand?: string) => {
      const end = elapsed() + span(range)
      let expanded = false

      for (let beats = 0; beats < MAX_BEATS && elapsed() < end; beats += 1) {
         if (expand && !expanded && random() < 0.35) {
            expanded = await hands.clickSelector(expand)

            if (expanded) {
               await wait([1500, 4000])

               continue
            }
         }

         await beat()
      }
   }

   // Scrolls toward the nearest of these elements, up to 900 px at a time, or on down the page when there is none.
   const scrollToward = async (targets: Array<InspectedElement | undefined>, height: number) => {
      const goal = height * BRING_TO
      const [nearest] = targets
         .filter(target => target !== undefined)
         .sort((a, b) => Math.abs(a.box.y - goal) - Math.abs(b.box.y - goal))
      const distance = nearest ? Math.round(nearest.box.y - goal) : undefined

      await hands.scrollBy(
         distance === undefined
            ? span(pace.down) + 200
            : Math.sign(distance) * Math.min(SCROLL_TO.max, Math.max(SCROLL_TO.min, Math.abs(distance)))
      )
      await wait(pace.read)
   }

   // One reading scroll, and the pause after it.
   const scrollPage = async (direction: 'up' | 'down') => {
      await hands.scrollBy(direction === 'up' ? -span(pace.down) : span(pace.down))
      await wait(pace.read)
   }

   // Lets the pointer rest on the middle of an element.
   const rest = ({ box }: InspectedElement) =>
      hands.hover(box.x + Math.round(box.width / 2), box.y + Math.round(box.height / 2))

   return {
      elapsed,
      span,
      wait,
      dwell,
      scrollToward,
      scrollPage,
      rest,
   }
}

export type Reader = ReturnType<typeof createReader>
