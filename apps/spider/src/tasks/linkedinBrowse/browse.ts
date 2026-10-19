import { handsOf } from '../../browsing/hands'
import { createOverlay } from '../../browsing/overlay'
import { createReader } from '../../browsing/reader'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import { POST_BLOCK, POST_WINDOW } from '../../linkedin/markup'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'
import { createFinder } from './finder'
import { createRoutes } from './routes'
import { WalkState } from './state'
import { createVisits } from './visits'
import { BUDGET_MS, PACE, STAYS, planWalk } from './walk'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot'>

// DONE: the feed was read, at least one whole cycle (out of the feed and back) was made, and the feed still opens at the end.
// NO_CYCLE: signed in, but nothing could be opened from the feed. SIGNED_OUT: LinkedIn asked for a sign-in.
export type BrowseOutcome = 'DONE' | 'SIGNED_OUT' | 'NO_CYCLE'

// After this many targets in a row that came to nothing the walk stops: something is wrong and more clicks will not mend it.
const MAX_FAILURES_IN_A_ROW = 4

// A day of browsing as its owner would: the feed read for two or three minutes, then five to eight times out of the feed into
// a post, a profile, or a post and the profile of who posted it, and back. It only reads: it clicks links to members and
// companies and the "more" of a post, never a button that does something, and keeps nothing of what it sees unless `snapshots`
// is set, when the first feed, post, window and profile are kept with the run to study how the real pages are built.
//
// This is only the wiring: pacing is `browsing/reader`, the window is `browsing/overlay`, the loop is `browsing/targets`, what
// LinkedIn looks like is in `linkedin/`, and the ways out of the feed are `routes`.
export const browseLinkedin = async (
   context: Context,
   baseUrl: string,
   random: () => number = Math.random,
   snapshots = false,
   now: () => number = Date.now
): Promise<BrowseOutcome> => {
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
   const keep = createKeep(context, snapshots, POST_BLOCK)
   const state = new WalkState()
   const finder = createFinder({
      hands,
      reader,
      state,
      baseUrl,
      random,
      log,
      keep,
   })
   const visits = createVisits({
      hands,
      reader,
      overlay: createOverlay({
         hands,
         reader,
         spec: POST_WINDOW,
      }),
      session,
      log,
      keep,
   })
   const { walkRoute } = createRoutes({
      state,
      finder,
      visits,
      session,
      reader,
      log,
      warn,
   })

   try {
      const walk = planWalk(random)

      await session.acceptConsent(await session.openFeed())
      log(`Reading the feed for about ${Math.round(walk.feedMs / 1000)} seconds`)
      await reader.dwell([walk.feedMs, walk.feedMs])
      await keep('feed')

      const cycles = await runTargets({
         targets: walk.targets,
         step: walkRoute,
         recover: async () => {
            await session.openFeed()
         },
         between: () => reader.dwell(STAYS.between),
         elapsed: reader.elapsed,
         budgetMs: BUDGET_MS,
         maxFailuresInARow: MAX_FAILURES_IN_A_ROW,
         isFatal: error => error instanceof SignedOut,
         warn,
         says: {
            stepStopped: 'A step of the walk stopped early',
            notRecovered: 'The feed could not be opened again',
         },
      })

      // The session is kept after a DONE, so it must still open the feed at the very end; a cancelled one is never kept.
      await session.openFeed()
      log(`Made ${cycles} round trips, back on the feed and still signed in`)

      return cycles > 0 ? 'DONE' : 'NO_CYCLE'
   } catch (error) {
      if (error instanceof SignedOut) {
         return 'SIGNED_OUT'
      }

      throw error
   }
}
