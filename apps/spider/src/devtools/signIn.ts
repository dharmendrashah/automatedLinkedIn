import { isSignedOutPage } from '../linkedin/session'

export type FeedPage = {
   goto: (url: string) => Promise<void>
   url: () => string
}

type FeedOptions = {
   page: FeedPage
   feedUrl: string
   // Signs the account in again and resolves to whether it worked; absent when this run cannot do it.
   signIn?: () => Promise<boolean>
   log: (line: string) => void
}

// Opens the feed and, when LinkedIn answers with a sign-in page, signs in again with the stored password and two-step key (the `linkedin-login` task) and opens it once more.
// Resolves to whether the page is now past the sign-in.
export const reachFeed = async ({ page, feedUrl, signIn, log }: FeedOptions) => {
   await page.goto(feedUrl)

   if (!isSignedOutPage(page.url())) {
      return true
   }

   log(`\nLinkedIn asked for a sign-in (${new URL(page.url()).pathname}) instead of showing the feed.`)

   if (!signIn) {
      log('Sign in by hand in the browser window.')

      return false
   }

   log('Signing in with the stored password and two-step key.')

   if (!(await signIn())) {
      log('The sign-in did not work.')

      return false
   }

   await page.goto(feedUrl)

   if (isSignedOutPage(page.url())) {
      log('Still signed out after the sign-in.')

      return false
   }

   log('Signed in again; carrying on.')

   return true
}
