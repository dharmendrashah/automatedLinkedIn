import { createKeep } from '../browsing/snapshot'
import { type TaskOutcome } from '../tasks/defineTask'
import { type PageContext, type PageDeps, createPages } from './pages'
import { SignedOut } from './session'

export type ViewOutcome = 'DONE' | 'NOT_AVAILABLE' | 'SIGNED_OUT'

// How long the page is left alone after it opened, before it is read down. A little different each time.
const WAIT_MS = [5000, 6000] as const

type View = {
   // The paths that count as the page that was asked for; a page that is gone or hidden sends the browser elsewhere.
   landedOn: RegExp
   snapshots: boolean
   // The name the page is kept under with the run, when the owner asked for it.
   keepAs: string
}

// Someone else's page (a member's profile, a company), looked at the way a person looks at it (.plan/visit-profile-task.md): the
// address is opened, left for about five seconds, and the page is scrolled to its end so every part of it is drawn. Nothing is
// clicked and nothing is read: the point is the visit itself. The address and what the page holds never reach the log or a warning.
export const viewPage = async (
   context: PageContext,
   baseUrl: string,
   address: string,
   { landedOn, snapshots, keepAs }: View,
   deps: PageDeps = {}
): Promise<ViewOutcome> => {
   const { log } = context
   const pages = createPages(context, baseUrl, deps)
   const keep = createKeep(context, snapshots)

   try {
      const landed = await pages.open(address)

      await pages.session.acceptConsent(landed)

      if (!landedOn.test(new URL(landed).pathname)) {
         log('The address did not lead to the page that was asked for')

         return 'NOT_AVAILABLE'
      }

      await pages.reader.wait(WAIT_MS)
      await pages.scrollThrough()
      await keep(keepAs)
      log('Looked at the page down to its end')

      return 'DONE'
   } catch (error) {
      if (error instanceof SignedOut) {
         return 'SIGNED_OUT'
      }

      throw error
   }
}

// What the owner is told of a visit: fixed sentences, never a name or a word of the page. `noun` is "profile" or "company page".
export const answerForView = (outcome: ViewOutcome, noun: string): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (outcome === 'NOT_AVAILABLE') {
      return {
         status: 'FAILED',
         verdict: 'NOT_AVAILABLE',
         message: `The page was not a ${noun} that could be viewed.`,
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: 'DONE',
      message: `Viewed the ${noun}.`,
      commitSession: true,
   }
}
