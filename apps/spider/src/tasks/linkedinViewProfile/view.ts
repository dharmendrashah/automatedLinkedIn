import { createKeep } from '../../browsing/snapshot'
import { type PageContext, type PageDeps, createPages } from '../../linkedin/pages'
import { SignedOut } from '../../linkedin/session'

export type ViewOutcome = 'DONE' | 'NOT_AVAILABLE' | 'SIGNED_OUT'

// How long the page is left alone after it opened, before it is read down. A little different each time.
const WAIT_MS = [5000, 6000] as const
const PROFILE_PATH = /^\/in\/[^/]+/

// Someone else's profile, looked at the way a person looks at it (.plan/visit-profile-task.md): the address is opened, left for about
// five seconds, and the page is scrolled to its end so every part of it is drawn. Nothing is clicked and nothing is read: the point
// is the visit itself, which LinkedIn shows to the member. The address and what the page holds never reach the log or a warning.
export const viewProfile = async (
   context: PageContext,
   baseUrl: string,
   profileUrl: string,
   { snapshots }: { snapshots: boolean },
   deps: PageDeps = {}
): Promise<ViewOutcome> => {
   const { log } = context
   const pages = createPages(context, baseUrl, deps)
   const keep = createKeep(context, snapshots)

   try {
      const landed = await pages.open(profileUrl)

      await pages.session.acceptConsent(landed)

      // A profile that is gone or hidden sends the browser to another page (the feed, a "page not found" page).
      if (!PROFILE_PATH.test(new URL(landed).pathname)) {
         log('The address did not lead to a profile')

         return 'NOT_AVAILABLE'
      }

      await pages.reader.wait(WAIT_MS)
      await pages.scrollThrough()
      await keep('profile')
      log('Looked at the profile down to its end')

      return 'DONE'
   } catch (error) {
      if (error instanceof SignedOut) {
         return 'SIGNED_OUT'
      }

      throw error
   }
}
