import { StepFailed, describeError } from '../../browsing/errors'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import { SignedOut } from '../../linkedin/session'
import { type PageContext, type PageDeps, createPages, listLimit } from './pages'

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
   // The Contact info window of the profile's own address: phone, email, messengers, websites, birthday (the owner's, private).
   {
      name: 'contact',
      path: 'overlay/contact-info/',
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

// No new page is begun after this much of the run; the time limit of the task is longer, so the one in progress can end.
export const BUDGET_MS = 10 * 60 * 1000
// After this many pages in a row that did not open the run stops: something is wrong.
const MAX_FAILURES_IN_A_ROW = 3

// Capture step of the profile task (.plan/linkedin-profile-task.md): it opens the account's own profile and the pages behind its
// "Show all" links, scrolls each down so its lazy parts are drawn, and keeps every page (markup, links and a picture) with the run,
// so the readers can be written from the real pages. It reads nothing and clicks nothing. The address of the profile never reaches
// the log, because it holds the owner's name.
export const captureProfile = async (
   context: PageContext,
   baseUrl: string,
   deps: PageDeps = {}
): Promise<ProfileCapture> => {
   const { log, warn } = context
   const pages = createPages(context, baseUrl, deps)
   // A run keeps at most 20 files: the profile keeps its markup and its links and controls, each detail page only its markup.
   const keep = createKeep(context, true)
   const keepLean = createKeep(context, true, undefined, false)
   let kept = 0

   const keepPage = async (name: string, lean = true, limit = 0) => {
      await pages.scrollThrough(limit)
      await (lean ? keepLean : keep)(name)
      kept += 1
   }

   const missed = (done: number) => DETAIL_PAGES.length - done

   try {
      const profile = await pages.openOwn()

      if (!profile) {
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

      const done = await runTargets({
         targets: [...DETAIL_PAGES],
         step: async ({ name, path }) => {
            await pages.open(`${profile}${path}`)
            await keepPage(`detail-${name}`, true, listLimit(name))
            log(`Kept the page of ${name}`)

            if (name === 'interests') {
               await pages.eachInterestTab(tab => keepPage(`detail-interests-${tab + 1}`, true, listLimit('interests')))
            }

            return true
         },
         recover: () => Promise.resolve(),
         between: pages.between,
         elapsed: pages.elapsed,
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
