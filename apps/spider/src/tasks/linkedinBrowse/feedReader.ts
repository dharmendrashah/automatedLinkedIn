import { type InspectedElement, type PageInspection } from '../../scraping/driver'

// How today's LinkedIn feed marks itself up (seen on a real feed, 2026-10-19): a post is one of these blocks, its pages are
// found by address, and its author is the one link that leads to a member or a company.
export const POST_BLOCK = '[data-view-name="feed-full-update"]'

// What a click must never land on, even inside a link: buttons and menus, and the Follow actions that sit inside the
// whole-row links of the recommendations.
export const NEVER_CLICK =
   'button, [role="button"], [role="menuitem"], input, select, textarea, summary, [data-view-name="edge-creation-follow-action"], [data-view-name="relationship-building-button"]'

// The windows that open over the feed (a post's image opens one, with the post and its comments beside it).
// The feed's video players hold hidden `role="dialog"` panels, so only an open one counts; the post window is a native `<dialog open>`.
export const DIALOG = 'dialog[open], [role="dialog"]:not([aria-hidden="true"]), [aria-modal="true"]'
// The close button of that window, for when Escape does not close it.
export const DISMISS = 'dialog[open] > button[aria-label="Dismiss"]'

// The "... more" that opens the rest of a long post.
export const MORE_BUTTON = '[data-testid="expandable-text-box"] button'

// A post a person wrote has an action bar; the rows of "Recommended for you" and the banners do not.
const ACTION_BAR = 'reaction-button'
// Promoted posts and calls to action: opening them is an ad click.
const PROMOTED = ['feed-call-to-action', 'feed-promo-image-click', 'feed-actor-sub-description-cta']

const OWN_PROFILE = 'identity-self-profile'
const AUTHOR = 'feed-actor'
// Where a post's id is found in its markup (seen on a real feed): a written post carries it in its text's key, a shared one as
// a share id, one with comments in the id of each comment, and a few in an anchor id.
const UGC_ID = /userGeneratedContentId=(\d{12,})/
const SHARE_ID = /shareId=(\d{12,})/
const COMMENT_ON = /urn:li:comment:\((activity|ugcPost|share):(\d{12,})/
const URN = /urn:li:(activity|ugcPost|share):(\d{12,})/

// What an image link of a post leads to by its address: the feed itself. The page answers a click in script, by opening a window.
const IMAGE_MIN = {
   width: 200,
   height: 120,
}
// How much of an image must show in the window for a person to click it.
const IMAGE_SEEN_PX = 120

export type FeedPost = {
   // Tells one post from another: its address, or its author's when its markup holds no id.
   key: string
   // Where the post's own page is, when its markup says which post it is. About half of a feed's posts hold no id.
   url?: string
   // The link to who posted it, as the page lists it, and the element a pointer can rest on.
   authorHref?: string
   header?: InspectedElement
   // The big image of the post, a link that opens the post in a window over the feed, and whether enough of it shows to click.
   image?: InspectedElement
   imageSeen: boolean
   // The header is in the window and nothing covers it, so a person could see and use it now.
   shown: boolean
}

// A post has no link of its own on this feed, but its id is usually in its markup.
export const postAddress = (baseUrl: string, keys: string[]) => {
   const at = (kind: string, id: string) => `${baseUrl}/feed/update/urn:li:${kind}:${id}/`

   for (const key of keys) {
      const found = UGC_ID.exec(key)

      if (found) {
         return at('ugcPost', found[1])
      }
   }

   for (const key of keys) {
      const found = SHARE_ID.exec(key)

      if (found) {
         return at('share', found[1])
      }
   }

   for (const pattern of [COMMENT_ON, URN]) {
      for (const key of keys) {
         const found = pattern.exec(key)

         if (found) {
            return at(found[1], found[2])
         }
      }
   }

   return undefined
}

const inside = (link: InspectedElement, name: string) => link.path.some(step => step.includes(name))

// The link to whoever wrote the post: a member or a company of the site, not a mention in the text and not a commenter.
export const authorOf = (links: InspectedElement[], baseUrl: string) => {
   const { origin } = new URL(baseUrl)
   const candidates = links.filter(link => {
      if (!link.href || inside(link, 'feed-commentary') || inside(link, 'comment-container')) {
         return false
      }

      try {
         const { origin: at, pathname } = new URL(link.href)

         return at === origin && /^\/(in|company)\//.test(pathname)
      } catch {
         return false
      }
   })

   return candidates.find(({ view }) => view === AUTHOR) ?? candidates[0]
}

// Who wrote the post on its own page. That page marks nothing, so it is the first member or company link of the page that is
// not the account's own and not in a mention, a reaction or a comment.
export const authorOnPage = (links: InspectedElement[], baseUrl: string, own?: string) => {
   const { origin } = new URL(baseUrl)

   return links.find(link => {
      if (!link.href || link.href === own || inside(link, 'expandable-text-box') || inside(link, 'ReactionFacepile')) {
         return false
      }

      try {
         const { origin: at, pathname } = new URL(link.href)

         return at === origin && /^\/(in|company)\//.test(pathname) && !pathname.startsWith('/in/me/')
      } catch {
         return false
      }
   })
}

// The big image of a post: a link back to the feed (not the reactions count, the article card or the send link, which are
// small or marked), where a click opens the post in a window.
export const imageOf = (links: InspectedElement[], baseUrl: string) => {
   const { origin } = new URL(baseUrl)

   return links.find(link => {
      if (!link.href || ['feed-article', 'view-likers'].includes(link.view)) {
         return false
      }

      if (inside(link, 'feed-commentary') || inside(link, 'comment-container')) {
         return false
      }

      try {
         const { origin: at, pathname } = new URL(link.href)

         return (
            at === origin &&
            ['/feed/', '/feed/foryou/'].includes(pathname) &&
            link.box.width >= IMAGE_MIN.width &&
            link.box.height >= IMAGE_MIN.height
         )
      } catch {
         return false
      }
   })
}

const eligible = (marks: string[]) => marks.includes(ACTION_BAR) && !PROMOTED.some(mark => marks.includes(mark))

// What the feed shows right now: the account's own profile, and the posts that can be opened, in page order.
export const readFeed = (
   { links, blocks, viewport }: Pick<PageInspection, 'links' | 'blocks' | 'viewport'>,
   baseUrl: string
) => {
   const own = links.find(({ view }) => view === OWN_PROFILE)?.href
   const posts: FeedPost[] = []

   for (const block of blocks) {
      const url = postAddress(baseUrl, block.keys)
      const header = authorOf(block.links, baseUrl)
      const image = imageOf(block.links, baseUrl)
      const key = url ?? header?.href

      // A post that is neither known by its id nor by its author cannot be opened any way.
      if (!key || !eligible(block.marks)) {
         continue
      }

      posts.push({
         key,
         ...(url && { url }),
         ...(header?.href && { authorHref: header.href }),
         ...(header && { header }),
         ...(image && { image }),
         imageSeen: Boolean(
            image &&
            !image.covered &&
            Math.min(image.box.y + image.box.height, viewport.height) - Math.max(image.box.y, 0) >= IMAGE_SEEN_PX
         ),
         shown: Boolean(header?.inView && !header.covered),
      })
   }

   return {
      own,
      posts,
   }
}
