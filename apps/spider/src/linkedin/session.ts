import { type Hands } from '../browsing/hands'
import { type DetectionSession } from '../scraping/driver'
import { type TaskContext, VisitError } from '../tasks/defineTask'
import { SELECTORS, kindOf } from '../tasks/linkedinLogin/accountValidator'

// LinkedIn asked for a sign-in: the session this run started with is no longer accepted.
export class SignedOut extends Error {}

// A sign-in or security check page: the session is not accepted. Every walk through LinkedIn checks each page it lands on
// with this, so a task answers SIGNED_OUT instead of reading or clicking a login form.
export const isSignedOutPage = (url: string) => ['login', 'checkpoint'].includes(kindOf(url))

type Deps = {
   browser: Pick<DetectionSession, 'clearCookies' | 'exists' | 'click'>
   hands: Pick<Hands, 'back'>
   visit: TaskContext['visit']
   log: (message: string) => void
   baseUrl: string
}

// Moving between LinkedIn pages as a signed-in member: every page that opens is checked to still be signed in, and the feed is the
// place every walk starts from and comes back to.
export const createSession = ({ browser, hands, visit, log, baseUrl }: Deps) => {
   const signedIn = (url: string) => {
      if (isSignedOutPage(url)) {
         throw new SignedOut()
      }

      return url
   }

   const open = async (url: string) => signedIn(await visit(url))

   // A cancelled session makes LinkedIn send the feed round in circles (recorded 2026-10-18): without the token it is loaded
   // once more, and a sign-in page then says signed out. A second failure goes on as an error.
   const openFeed = async () => {
      try {
         return await open(`${baseUrl}/feed/`)
      } catch (error) {
         if (!(error instanceof VisitError && error.reason === 'load')) {
            throw error
         }

         await browser.clearCookies('li_at')

         return open(`${baseUrl}/feed/`)
      }
   }

   // The ads consent page LinkedIn may show; the owner chose to accept it.
   const acceptConsent = async (landed: string) => {
      if (kindOf(landed) === 'consent' && (await browser.exists(SELECTORS.consentAccept, 1500))) {
         await browser.click(SELECTORS.consentAccept)
         log('Accepted the ads consent page')
      }
   }

   const onFeed = (url: string) => {
      const { pathname } = new URL(url)

      return pathname.startsWith('/feed') && !pathname.startsWith('/feed/update')
   }

   // Back by the browser's history; when it did not lead to the feed, the feed is opened again.
   const goBack = async (steps: number) => {
      let url = ''

      for (let step = 0; step < steps; step += 1) {
         url = signedIn(await hands.back())
      }

      if (!onFeed(url)) {
         await openFeed()
      }

      log('Back on the feed')
   }

   return {
      signedIn,
      open,
      openFeed,
      acceptConsent,
      goBack,
   }
}

export type Session = ReturnType<typeof createSession>
