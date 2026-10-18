import { type TaskContext, VisitError } from '../defineTask'
import { SELECTORS, kindOf } from './accountValidator'

const SCROLLS = 4
const SCROLL_PX = 700
const STAY_MIN_MS = 15_000
const STAY_MAX_MS = 20_000

export const between = (min: number, max: number, random: () => number) => min + Math.floor(random() * (max - min + 1))

// What a person does after signing in: reads down the feed, opens their own profile and stays a while. It says whether the
// browser is still signed in afterwards, so a session that got logged out is not kept. A page that cannot be opened is
// not a failed login.
export const browseAfterLogin = async (
   { browser, visit, pause, log, warn }: Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn'>,
   baseUrl: string,
   random: () => number = Math.random
) => {
   const scroll = async () => {
      for (let count = 0; count < SCROLLS; count += 1) {
         await browser.scrollBy(SCROLL_PX)
         await pause(between(800, 2000, random))
      }
   }

   try {
      await scroll()

      // LinkedIn sends /in/me/ to the profile of whoever is signed in.
      let landed = await visit(`${baseUrl}/in/me/`)

      if (['login', 'checkpoint'].includes(kindOf(landed))) {
         warn('LinkedIn asked for a sign-in again on the profile page')

         return false
      }

      // Its ads consent page can come first; it is accepted, as the owner chose, and the profile opened again.
      if (kindOf(landed) === 'consent' && (await browser.exists(SELECTORS.consentAccept, 1500))) {
         await browser.click(SELECTORS.consentAccept)
         log('Accepted the ads consent page')
         landed = await visit(`${baseUrl}/in/me/`)
      }

      log(kindOf(landed) === 'consent' ? 'Stayed on the ads consent page' : 'Opened the own profile')
      await scroll()
      await pause(between(STAY_MIN_MS, STAY_MAX_MS, random))
   } catch (error) {
      warn(error instanceof VisitError ? error.message : 'The visit to the profile stopped early')
   }

   return true
}
