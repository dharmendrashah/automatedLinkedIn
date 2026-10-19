import { StepFailed } from '../../browsing/errors'
import { type Hands } from '../../browsing/hands'
import { type Overlay } from '../../browsing/overlay'
import { type Reader } from '../../browsing/reader'
import { type FeedPost } from '../../linkedin/feedReader'
import { MORE_BUTTON, NEVER_CLICK, POST_PAGE, PROFILE_PAGE } from '../../linkedin/markup'
import { type Session } from '../../linkedin/session'
import { look } from './finder'
import { STAYS } from './walk'

type Deps = {
   hands: Hands
   reader: Pick<Reader, 'dwell'>
   overlay: Pick<Overlay, 'open' | 'close'>
   session: Pick<Session, 'open' | 'signedIn'>
   log: (message: string) => void
   keep: (name: string) => Promise<void>
}

// Where the comments are in the post window, as a fraction of the window: the pointer rests there, so the wheel scrolls them.
const COMMENTS_AT = {
   x: 0.8,
   y: 0.55,
}

// The ways out of the feed that a walk takes, each ending with the page read for a while. None of them goes back: that is the
// route's to decide, since it knows how many pages it has been through.
export const createVisits = ({ hands, reader, overlay, session, log, keep }: Deps) => {
   const openPost = async (address: string) => {
      const landed = await session.open(address)

      if (!POST_PAGE.test(new URL(landed).pathname)) {
         throw new StepFailed('The address of the post did not open a post.')
      }

      log('Opened a post')
      await reader.dwell(STAYS.post, MORE_BUTTON)
      await keep('post')
   }

   const openProfile = async (href: string) => {
      const clicked = await hands.clickLink(href, NEVER_CLICK)

      if (!clicked) {
         throw new StepFailed('The link to the profile could not be clicked.')
      }

      const landed = session.signedIn(clicked)

      if (!PROFILE_PAGE.test(new URL(landed).pathname)) {
         throw new StepFailed('The link did not open a profile.')
      }

      log('Opened a profile')
      await reader.dwell(STAYS.profile)
      await keep('profile')
   }

   // Opens the post in the window its image opens (no address changes), reads its comments beside it, and closes it again.
   const readInWindow = async ({ image }: FeedPost) => {
      if (!image) {
         throw new StepFailed('The image of the post could not be clicked.')
      }

      await overlay.open(image)
      log('Opened a post in its window')
      await keep('window')

      const { viewport } = await look(hands)

      await hands.hover(Math.round(viewport.width * COMMENTS_AT.x), Math.round(viewport.height * COMMENTS_AT.y))
      await reader.dwell(STAYS.post, MORE_BUTTON)
      await overlay.close(image)
   }

   return {
      openPost,
      openProfile,
      readInWindow,
   }
}

export type Visits = ReturnType<typeof createVisits>
