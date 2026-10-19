import { StepFailed, describeError } from '../../browsing/errors'
import { type Reader } from '../../browsing/reader'
import { type FeedPost } from '../../linkedin/feedReader'
import { type Session, SignedOut } from '../../linkedin/session'
import { type Finder, type Need, SEARCH_TRIES } from './finder'
import { type WalkState } from './state'
import { type Visits } from './visits'
import { type Route, STAYS } from './walk'

type Kit = {
   state: WalkState
   finder: Finder
   visits: Visits
   session: Pick<Session, 'goBack' | 'openFeed'>
   reader: Pick<Reader, 'wait' | 'rest'>
   log: (message: string) => void
   warn: (message: string) => void
}

// How many of the tries at finding something to open are spent on a post before the target goes by an author instead.
const ADDRESS_TRIES = 6

// One way out of a post of the feed and back; true when it came back having opened something.
type Way = (post: FeedPost) => Promise<boolean>

// The routes a walk can take out of the feed and back. Each says what it needs to find on the feed and how it goes from there; a new
// route is one more entry (and its weight in `walk.ts`).
export const createRoutes = ({ state, finder, visits, session, reader, log, warn }: Kit) => {
   // A post that cannot be opened, by its image or its address, counts: twice and the rest of the walk goes by profiles.
   const counted = async (open: () => Promise<void>) => {
      try {
         await open()
      } catch (error) {
         if (error instanceof StepFailed) {
            state.postFailures += 1
         }

         throw error
      }
   }

   const toProfile: Way = async ({ authorHref }) => {
      if (!authorHref) {
         return false
      }

      await visits.openProfile(authorHref)
      await session.goBack(1)

      return true
   }

   // Read in the window the image opens, then (when asked) the name of who posted is scrolled back to and clicked.
   const inWindow =
      (andAuthor: boolean): Way =>
      async post => {
         await counted(() => visits.readInWindow(post))

         if (!andAuthor || !post.authorHref) {
            return true
         }

         const shown = await finder.showHeader(post.key)

         if (shown?.authorHref) {
            await visits.openProfile(shown.authorHref)
            await session.goBack(1)
         }

         return true
      }

   // Opened by its address, then (when asked) the author it links to, and back through both pages.
   const byAddress =
      (andAuthor: boolean): Way =>
      async ({ url }) => {
         if (!url) {
            return false
         }

         await counted(() => visits.openPost(url))

         if (!andAuthor) {
            await session.goBack(1)

            return true
         }

         const author = await finder.findAuthorOnPage()

         if (!author?.href) {
            log('The post links to no other author')
            await session.goBack(1)

            return true
         }

         state.usedAuthors.add(author.href)

         try {
            await visits.openProfile(author.href)
            await session.goBack(2)
         } catch (error) {
            if (error instanceof SignedOut) {
               throw error
            }

            // The post was opened and read; only the step to its author did not work.
            warn(describeError(error, 'The step to the author stopped early'))
            await session.openFeed()
         }

         return true
      }

   // A post with an image is read in the window its image opens; one with only an address is opened by it.
   const readPost =
      (andAuthor: boolean): Way =>
      target =>
         (target.imageSeen ? inWindow(andAuthor) : byAddress(andAuthor))(target)

   const routes: Record<Route, { finds: Need; go: Way }> = {
      post: {
         finds: 'post',
         go: readPost(false),
      },
      profile: {
         finds: 'author',
         go: toProfile,
      },
      'post-profile': {
         finds: 'post',
         go: readPost(true),
      },
   }

   // Looks at the post a moment before opening it, with the pointer resting on its header.
   const notice = async ({ header }: FeedPost) => {
      if (header) {
         await reader.rest(header)
      }

      await reader.wait(STAYS.notice)
   }

   // One target: finds a post for the route, and goes by it. A post that cannot be opened is not worth a trip, so then the target
   // goes by an author. False when there was nothing to open.
   const walkRoute = async (planned: Route) => {
      let route: Route = state.profilesOnly ? 'profile' : planned
      let found = await finder.findPost(routes[route].finds, route === 'profile' ? SEARCH_TRIES : ADDRESS_TRIES)

      if (!found && route !== 'profile') {
         log('No post that can be opened showed, so this one goes by an author')
         state.addressMisses += 1
         route = 'profile'
         found = await finder.findPost('author', SEARCH_TRIES - ADDRESS_TRIES)
      }

      if (!found) {
         warn('The feed showed no post to open')

         return false
      }

      state.take(found)
      await notice(found)

      return routes[route].go(found)
   }

   return { walkRoute }
}
