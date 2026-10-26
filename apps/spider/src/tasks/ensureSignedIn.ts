import { isSignedOutPage } from '../linkedin/session'
import { VisitError } from './defineTask'

type Options = {
   baseUrl: string
   // Opens a page the way the run does (allowlist, robots, rate limit); a page that does not load, a 404 included, throws a
   // VisitError.
   visit: (url: string) => Promise<string>
   // Signs the account in again in this browser; resolves to whether it worked. Asked at most once.
   signIn: () => Promise<boolean>
   log: (message: string) => void
}

// READY: the session is accepted. SIGNED_IN: it was not, and a new sign-in worked. FAILED: it was not and the sign-in did not.
export type Entry = 'READY' | 'SIGNED_IN' | 'FAILED'

// A page that did not load (a 404 is one) says nothing about the session; any other error is not this step's to answer.
const land = async (visit: Options['visit'], url: string) => {
   try {
      return await visit(url)
   } catch (error) {
      if (error instanceof VisitError && error.reason === 'load') {
         return undefined
      }

      throw error
   }
}

// What every task that uses an account starts with: the feed. A sign-in page there means the session is gone. A feed that does not
// open is looked into through the login page, which sends a signed-in member to the feed (a 404 on a deep address was seen on
// staging, 2026-10-26). Only then does the account sign in again, once.
export const ensureSignedIn = async ({ baseUrl, visit, signIn, log }: Options): Promise<Entry> => {
   const feed = await land(visit, `${baseUrl}/feed/`)

   if (feed !== undefined && !isSignedOutPage(feed)) {
      return 'READY'
   }

   if (feed === undefined) {
      log('The feed did not open; looking at the login page')

      const login = await land(visit, `${baseUrl}/login`)

      if (login !== undefined && !isSignedOutPage(login)) {
         log('The login page leads to the feed, so the session is fine')

         return 'READY'
      }
   }

   log('LinkedIn asks for a sign-in; signing in with the stored password')

   if (!(await signIn())) {
      log('The sign-in did not work')

      return 'FAILED'
   }

   log('Signed in again')

   return 'SIGNED_IN'
}
