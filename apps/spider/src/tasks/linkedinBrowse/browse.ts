import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createOverlay } from '../../browsing/overlay'
import { createReader } from '../../browsing/reader'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import { profilesOnPage, readFeed } from '../../linkedin/feedReader'
import { POST_BLOCK, POST_WINDOW } from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext } from '../defineTask'
import { createFinder, look } from './finder'
import { createRoutes } from './routes'
import { WalkState } from './state'
import { createVisits } from './visits'
import { BUDGET_MS, STAYS, planWalk } from './walk'

type Context = Pick<
   TaskContext,
   'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot' | 'signInAgain'
>

// DONE: the feed was read, at least one whole cycle (out of the feed and back) was made, and the feed still opens at the end.
// NO_CYCLE: signed in, but nothing could be opened from the feed. NO_FEED: the feed shows no post and no profile to open.
// SIGNED_OUT: LinkedIn asked for a sign-in again and it did not work.
export type BrowseOutcome = 'DONE' | 'SIGNED_OUT' | 'NO_CYCLE' | 'NO_FEED'

// After this many targets in a row that came to nothing the walk stops: something is wrong and more clicks will not mend it.
const MAX_FAILURES_IN_A_ROW = 4

// When the feed shows no post to open, this many of its profiles are opened by their addresses instead, and the visit ends.
const FALLBACK_PROFILES = 3
const FEED_EMPTY = 'The feed showed no post and no profile to open.'

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
   const { browser, visit, pause, log, warn, signInAgain } = context
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

      const inspected = await look(hands)
      const shown = readFeed(inspected, baseUrl)

      // A feed with no post to open is not walked target after target: a few of its profiles are opened by their addresses, and
      // the visit ends with what it could open.
      if (shown.posts.length === 0) {
         log('The feed shows no post to open, so a few of its profiles are opened instead')
         let opened = 0

         for (const address of profilesOnPage(inspected.links, baseUrl, shown.own, FALLBACK_PROFILES)) {
            try {
               await visits.openProfileByAddress(address)
               opened += 1
            } catch (error) {
               if (error instanceof SignedOut) {
                  throw error
               }

               warn(describeError(error, 'A profile of the feed did not open'))
            }

            await session.openFeed()
         }

         if (opened === 0) {
            warn(FEED_EMPTY)

            return 'NO_FEED'
         }

         return 'DONE'
      }

      // Counted as they are made, so a walk that is interrupted keeps what it opened. A sign-in asked for in the middle of the walk
      // is answered once: the account signs in again and the walk goes on with the targets it has not begun.
      let started = 0
      let cycles = 0
      let signedInAgain = false
      let finished = false

      while (!finished) {
         try {
            await runTargets({
               targets: walk.targets.slice(started),
               step: async target => {
                  started += 1
                  const done = await walkRoute(target)

                  cycles += done ? 1 : 0

                  return done
               },
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
            finished = true
         } catch (error) {
            if (!(error instanceof SignedOut) || signedInAgain || !signInAgain) {
               throw error
            }

            signedInAgain = true
            log('LinkedIn asked for a sign-in in the middle of the visit, so the account signs in again')

            if (!(await signInAgain())) {
               throw error
            }

            await session.openFeed()
         }
      }

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
