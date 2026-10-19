import { type InspectedElement } from '../../scraping/driver'
import { type TaskContext, VisitError } from '../defineTask'
import { SELECTORS, kindOf } from '../linkedinLogin/accountValidator'
import { between } from '../linkedinLogin/browseAfterLogin'
import {
   DIALOG,
   DISMISS,
   type FeedPost,
   MORE_BUTTON,
   NEVER_CLICK,
   POST_BLOCK,
   authorOnPage,
   readFeed,
} from './feedReader'
import { snapshotPage } from './snapshot'
import { BUDGET_MS, type Route, TIMING, planWalk } from './walk'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'screenshot'>

type Range = readonly [number, number]

// DONE: the feed was read, at least one whole cycle (out of the feed and back) was made, and the feed still opens at the end.
// NO_CYCLE: signed in, but nothing could be opened from the feed. SIGNED_OUT: LinkedIn asked for a sign-in.
export type BrowseOutcome = 'DONE' | 'SIGNED_OUT' | 'NO_CYCLE'

// After this many targets in a row that came to nothing the walk stops: something is wrong and more clicks will not mend it.
const MAX_FAILURES_IN_A_ROW = 4
// A post address that does not open a post, or a feed that shows no post with one, twice means this feed cannot be walked that
// way; the rest goes by profiles.
const MAX_POST_FAILURES = 2
// How many times the feed is scrolled and looked at for a post to open before the target is given up, and how many of them are
// spent on a post with an address before the target goes by an author instead.
const SEARCH_TRIES = 14
const ADDRESS_TRIES = 6
// How far down the window a post is brought when the page is scrolled to it, as a fraction of the window's height.
const BRING_TO = 0.35
// A guard against a run that makes no progress in time (a stopped clock): no stay lasts more than this many small moves.
const MAX_BEATS = 120
const POST_PAGE = /\/(feed\/update|posts)\//
const PROFILE_PAGE = /^\/(in|company)\//

class SignedOut extends Error {}

const must = <T>(value: T | undefined, what: string): T => {
   if (value === undefined) {
      throw new Error(`This browser cannot ${what}.`)
   }

   return value
}

// A day of browsing as its owner would: the feed read for two or three minutes, then five to eight times out of the feed into
// a post, a profile, or a post and the profile of who posted it, and back. It only reads: it clicks links to members and
// companies and the "more" of a post, never a button that does something, and keeps nothing of what it sees unless `snapshots`
// is set, when the first feed, post and profile are kept with the run to study how the real pages are built.
export const browseLinkedin = async (
   context: Context,
   baseUrl: string,
   random: () => number = Math.random,
   snapshots = false,
   now: () => number = Date.now
): Promise<BrowseOutcome> => {
   const { browser, visit, pause, log, warn } = context

   if (!browser.inspect || !browser.clickLink || !browser.back) {
      throw new Error('This browser cannot browse by clicking.')
   }

   const begin = now()
   const elapsed = () => now() - begin
   const span = (range: Range) => between(range[0], range[1], random)
   const wait = (range: Range) => pause(span(range))
   const kept = new Set<string>()
   const keep = async (name: string) => {
      if (snapshots && !kept.has(name)) {
         kept.add(name)
         await snapshotPage(context, name, POST_BLOCK)
      }
   }

   const signedIn = (url: string) => {
      if (['login', 'checkpoint'].includes(kindOf(url))) {
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
   const onFeed = (url: string) => {
      const { pathname } = new URL(url)

      return pathname.startsWith('/feed') && !pathname.startsWith('/feed/update')
   }

   const look = async () => must(await browser.inspect?.({ block: POST_BLOCK }), 'be inspected')

   // One small move of a hand on a page: read on, look back up, let the pointer rest or drift, or just stay a while.
   const beat = async () => {
      const roll = random()

      if (roll < 0.62) {
         await browser.scrollBy(span(TIMING.down))
         await wait(TIMING.read)
      } else if (roll < 0.74) {
         await browser.scrollBy(-span(TIMING.up))
         await wait([800, 2500])
      } else if (roll < 0.84) {
         await browser.drift?.()
         await wait(TIMING.glance)
      } else {
         await wait(TIMING.linger)
      }
   }
   // Stays about this long where it is, in small moves. On a post it also opens the rest of a long text, once.
   const dwell = async (range: Range, reading = false) => {
      const end = elapsed() + span(range)
      let expanded = false

      for (let beats = 0; beats < MAX_BEATS && elapsed() < end; beats += 1) {
         if (reading && !expanded && random() < 0.35) {
            expanded = (await browser.clickSelector?.(MORE_BUTTON)) === true

            if (expanded) {
               await wait([1500, 4000])

               continue
            }
         }

         await beat()
      }
   }

   const used = new Set<string>()
   const usedAuthors = new Set<string>()
   let postFailures = 0
   let addressMisses = 0
   // The account's own profile, as the feed showed it: a post page does not show which link is the account's.
   let own: string | undefined

   // A post of the feed that is in view now and has not been used, to read (`post`: its image shows, which opens it in a window,
   // or it has an address and its header shows) or to go to the author of (`author`: somebody else's). When none is in view the
   // page is scrolled toward the nearest one it holds, or on down the feed for new ones.
   const findPost = async (need: 'post' | 'author', tries: number) => {
      let seen = 'no post'

      for (let attempt = 0; attempt < tries; attempt += 1) {
         const inspection = await look()
         const reading = readFeed(inspection, baseUrl)

         seen = `${reading.posts.length} posts, ${reading.posts.filter(post => post.image).length} with an image, ${reading.posts.filter(post => post.url).length} with an address, ${reading.posts.filter(post => used.has(post.key)).length} used`

         own = reading.own ?? own

         const wanted = (post: FeedPost) =>
            !used.has(post.key) &&
            (post.authorHref === undefined || post.authorHref !== own) &&
            (need === 'post'
               ? post.image !== undefined || post.url !== undefined
               : post.authorHref !== undefined && !usedAuthors.has(post.authorHref))
         const ready = (post: FeedPost) =>
            need === 'post' ? post.imageSeen || (post.shown && post.url !== undefined) : post.shown
         const options = reading.posts.filter(post => wanted(post) && ready(post))
         const chosen = options[Math.floor(random() * options.length)]

         if (chosen) {
            return chosen
         }

         await scrollToward(
            reading.posts.filter(wanted).map(post => (need === 'post' ? (post.image ?? post.header) : post.header)),
            inspection.viewport.height
         )
      }

      log(`Found no post to ${need === 'post' ? 'read' : 'go to the author of'} (${seen})`)
      await keep('no-post')

      return undefined
   }

   // Scrolls toward the nearest of these elements, up to 900 px at a time, or on down the feed when there is none.
   const scrollToward = async (targets: Array<InspectedElement | undefined>, height: number) => {
      const goal = height * BRING_TO
      const [nearest] = targets
         .filter(target => target !== undefined)
         .sort((a, b) => Math.abs(a.box.y - goal) - Math.abs(b.box.y - goal))
      const distance = nearest ? Math.round(nearest.box.y - goal) : undefined

      await browser.scrollBy(
         distance === undefined
            ? span(TIMING.down) + 200
            : Math.sign(distance) * Math.min(900, Math.max(150, Math.abs(distance)))
      )
      await wait(TIMING.read)
   }

   // Brings the header of a post of the feed into the window, as a person does before clicking the name.
   const showHeader = async (key: string) => {
      for (let tries = 0; tries < SEARCH_TRIES; tries += 1) {
         const inspection = await look()
         const post = readFeed(inspection, baseUrl).posts.find(found => found.key === key)

         if (post?.shown) {
            return post
         }

         await scrollToward([post?.header], inspection.viewport.height)
      }

      return undefined
   }

   // Who posted the post on this page. After reading, the header is out of the window; as a person does, the page is scrolled
   // back to it before it is clicked.
   const findAuthorOnPage = async () => {
      for (let tries = 0; tries < SEARCH_TRIES; tries += 1) {
         const author = authorOnPage((await look()).links, baseUrl, own)

         if (!author || (author.inView && !author.covered)) {
            return author
         }

         await browser.scrollBy(author.box.y < 0 ? -span(TIMING.down) : span(TIMING.down))
         await wait(TIMING.read)
      }

      return undefined
   }

   // Looks at the post a moment before opening it, with the pointer resting on its header.
   const notice = async ({ header }: FeedPost) => {
      if (header) {
         await browser.hover?.(
            header.box.x + Math.round(header.box.width / 2),
            header.box.y + Math.round(header.box.height / 2)
         )
      }

      await wait(TIMING.notice)
   }

   const openPost = async (address: string) => {
      const landed = await open(address)

      if (!POST_PAGE.test(new URL(landed).pathname)) {
         throw new VisitError('load', 'The address of the post did not open a post.')
      }

      log('Opened a post')
      await dwell(TIMING.post, true)
      await keep('post')
   }

   const openProfile = async (href: string) => {
      const clicked = await browser.clickLink?.(href, NEVER_CLICK)

      if (!clicked) {
         throw new VisitError('load', 'The link to the profile could not be clicked.')
      }

      const landed = signedIn(clicked)

      if (!PROFILE_PAGE.test(new URL(landed).pathname)) {
         throw new VisitError('load', 'The link did not open a profile.')
      }

      log('Opened a profile')
      await dwell(TIMING.profile)
      await keep('profile')
   }

   // Whether a window is open over the feed: a dialog on the page, or the image that was clicked has something over it now.
   const windowOpen = async (image: InspectedElement) => {
      const dialogs = must(await browser.inspect?.({ block: DIALOG }), 'be inspected')

      return (
         dialogs.blocks.length > 0 ||
         dialogs.links.some(
            link =>
               link.href === image.href &&
               Math.abs(link.box.x - image.box.x) <= 8 &&
               Math.abs(link.box.y - image.box.y) <= 8 &&
               link.covered
         )
      )
   }

   // Opens the post in the window its image opens (no address changes), reads its comments beside it, and closes it again.
   const openWindow = async (post: FeedPost) => {
      const { image } = post

      if (!image || !(await browser.clickInside?.(image.box, NEVER_CLICK))) {
         throw new VisitError('load', 'The image of the post could not be clicked.')
      }

      await wait([1200, 2500])

      if (!(await windowOpen(image))) {
         throw new VisitError('load', 'The image did not open the post in a window.')
      }

      log('Opened a post in its window')
      await keep('window')

      // The comments are in the right part of the window: the pointer rests there, so the wheel scrolls them.
      const { viewport } = await look()

      await browser.hover?.(Math.round(viewport.width * 0.8), Math.round(viewport.height * 0.55))
      await dwell(TIMING.post, true)

      // Escape first, as a person would; the close button when the page ignores it.
      for (const close of [() => browser.press('Escape'), () => browser.clickSelector?.(DISMISS)]) {
         if (!(await windowOpen(image))) {
            break
         }

         await close()
         await wait([800, 1500])
      }

      if (await windowOpen(image)) {
         throw new VisitError('load', 'The window of the post would not close.')
      }
   }

   const goBack = async (steps: number) => {
      let url = ''

      for (let step = 0; step < steps; step += 1) {
         url = signedIn(must(await browser.back?.(), 'go back'))
      }

      // The history did not lead back to the feed: it is opened again.
      if (!onFeed(url)) {
         await openFeed()
      }

      log('Back on the feed')
   }

   // One way out of the feed and back. True when it came back having opened something.
   const walkRoute = async (planned: Route) => {
      let route: Route = postFailures >= MAX_POST_FAILURES || addressMisses >= MAX_POST_FAILURES ? 'profile' : planned
      let post = route === 'profile' ? await findPost('author', SEARCH_TRIES) : await findPost('post', ADDRESS_TRIES)

      // A post that cannot be read, by its image or by its address, is not worth a trip: this one goes by an author.
      if (!post && route !== 'profile') {
         log('No post that can be opened showed, so this one goes by an author')
         addressMisses += 1
         route = 'profile'
         post = await findPost('author', SEARCH_TRIES - ADDRESS_TRIES)
      }

      if (!post) {
         warn('The feed showed no post to open')

         return false
      }

      used.add(post.key)

      if (post.authorHref) {
         usedAuthors.add(post.authorHref)
      }

      await notice(post)

      if (route === 'profile') {
         if (!post.authorHref) {
            return false
         }

         await openProfile(post.authorHref)
         await goBack(1)

         return true
      }

      // A post with an image is read in the window its image opens; one with only an address is opened by it.
      if (post.imageSeen) {
         try {
            await openWindow(post)
         } catch (error) {
            if (error instanceof VisitError) {
               postFailures += 1
            }

            throw error
         }

         if (route === 'post' || !post.authorHref) {
            return true
         }

         // The window is closed: the page is scrolled back to the name of who posted, and that is clicked.
         const shown = await showHeader(post.key)

         if (shown?.authorHref) {
            await openProfile(shown.authorHref)
            await goBack(1)
         }

         return true
      }

      if (!post.url) {
         return false
      }

      try {
         await openPost(post.url)
      } catch (error) {
         if (error instanceof VisitError) {
            postFailures += 1
         }

         throw error
      }

      if (route === 'post') {
         await goBack(1)

         return true
      }

      const author = await findAuthorOnPage()

      if (author?.href) {
         usedAuthors.add(author.href)

         try {
            await openProfile(author.href)
            await goBack(2)
         } catch (error) {
            if (error instanceof SignedOut) {
               throw error
            }

            // The post was opened and read; only the step to its author did not work.
            warn(error instanceof VisitError ? error.message : 'The step to the author stopped early')
            await openFeed()
         }
      } else {
         log('The post links to no other author')
         await goBack(1)
      }

      return true
   }

   try {
      const walk = planWalk(random)
      const feed = await openFeed()

      if (kindOf(feed) === 'consent' && (await browser.exists(SELECTORS.consentAccept, 1500))) {
         await browser.click(SELECTORS.consentAccept)
         log('Accepted the ads consent page')
      }

      log(`Reading the feed for about ${Math.round(walk.feedMs / 1000)} seconds`)
      await dwell([walk.feedMs, walk.feedMs])
      await keep('feed')

      let cycles = 0
      let inARow = 0

      for (const route of walk.targets) {
         if (elapsed() > BUDGET_MS || inARow >= MAX_FAILURES_IN_A_ROW) {
            break
         }

         try {
            if (await walkRoute(route)) {
               cycles += 1
               inARow = 0
            } else {
               inARow += 1
            }
         } catch (error) {
            if (error instanceof SignedOut) {
               throw error
            }

            warn(error instanceof VisitError ? error.message : 'A step of the walk stopped early')
            inARow += 1

            try {
               await openFeed()
            } catch (again) {
               if (again instanceof SignedOut) {
                  throw again
               }

               warn('The feed could not be opened again')
            }
         }

         await dwell(TIMING.between)
      }

      // The session is kept after a DONE, so it must still open the feed at the very end; a cancelled one is never kept.
      await openFeed()
      log(`Made ${cycles} round trips, back on the feed and still signed in`)

      return cycles > 0 ? 'DONE' : 'NO_CYCLE'
   } catch (error) {
      if (error instanceof SignedOut) {
         return 'SIGNED_OUT'
      }

      throw error
   }
}
