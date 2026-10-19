import { type Hands } from '../../browsing/hands'
import { type Reader } from '../../browsing/reader'
import { type FeedPost, authorOnPage, readFeed } from '../../linkedin/feedReader'
import { POST_BLOCK } from '../../linkedin/markup'
import { type WalkState } from './state'

// How many times the feed is scrolled and looked at for something before it is given up.
export const SEARCH_TRIES = 14

type Deps = {
   hands: Hands
   reader: Pick<Reader, 'scrollToward' | 'scrollPage'>
   state: WalkState
   baseUrl: string
   random: () => number
   log: (message: string) => void
   // Keeps a page with the run, to study how it is built, when the owner asked for that.
   keep: (name: string) => Promise<void>
}

export type Need = 'post' | 'author'

// The page as the walk reads it: the posts of the feed are the blocks it inspects.
export const look = (hands: Hands) => hands.inspect(POST_BLOCK)

// Finding what to open next: a post to read, somebody's author to go to, a header to click. It scrolls the way a person does, toward
// the thing wanted, and never picks one twice.
export const createFinder = ({ hands, reader, state, baseUrl, random, log, keep }: Deps) => {
   // A post of the feed that is in view now and has not been used, to read (`post`: its image shows, which opens it in a window,
   // or it has an address and its header shows) or to go to the author of (`author`: somebody else's). When none is in view the
   // page is scrolled toward the nearest one it holds, or on down the feed for new ones.
   const findPost = async (need: Need, tries: number) => {
      let seen = 'no post'

      for (let attempt = 0; attempt < tries; attempt += 1) {
         const inspection = await look(hands)
         const reading = readFeed(inspection, baseUrl)

         seen = `${reading.posts.length} posts, ${reading.posts.filter(post => post.image).length} with an image, ${reading.posts.filter(post => post.url).length} with an address, ${reading.posts.filter(post => state.used.has(post.key)).length} used`

         state.own = reading.own ?? state.own

         const wanted = (post: FeedPost) =>
            !state.used.has(post.key) &&
            (post.authorHref === undefined || post.authorHref !== state.own) &&
            (need === 'post'
               ? post.image !== undefined || post.url !== undefined
               : post.authorHref !== undefined && !state.usedAuthors.has(post.authorHref))
         const ready = (post: FeedPost) =>
            need === 'post' ? post.imageSeen || (post.shown && post.url !== undefined) : post.shown
         const options = reading.posts.filter(post => wanted(post) && ready(post))
         const chosen = options[Math.floor(random() * options.length)]

         if (chosen) {
            return chosen
         }

         await reader.scrollToward(
            reading.posts.filter(wanted).map(post => (need === 'post' ? (post.image ?? post.header) : post.header)),
            inspection.viewport.height
         )
      }

      log(`Found no post to ${need === 'post' ? 'read' : 'go to the author of'} (${seen})`)
      await keep('no-post')

      return undefined
   }

   // Brings the header of a post of the feed into the window, as a person does before clicking the name.
   const showHeader = async (key: string) => {
      for (let tries = 0; tries < SEARCH_TRIES; tries += 1) {
         const inspection = await look(hands)
         const post = readFeed(inspection, baseUrl).posts.find(found => found.key === key)

         if (post?.shown) {
            return post
         }

         await reader.scrollToward([post?.header], inspection.viewport.height)
      }

      return undefined
   }

   // Who posted the post on this page. After reading, the header is out of the window; as a person does, the page is scrolled
   // back to it before it is clicked.
   const findAuthorOnPage = async () => {
      for (let tries = 0; tries < SEARCH_TRIES; tries += 1) {
         const author = authorOnPage((await look(hands)).links, baseUrl, state.own)

         if (!author || (author.inView && !author.covered)) {
            return author
         }

         await reader.scrollPage(author.box.y < 0 ? 'up' : 'down')
      }

      return undefined
   }

   return {
      findPost,
      showHeader,
      findAuthorOnPage,
   }
}

export type Finder = ReturnType<typeof createFinder>
