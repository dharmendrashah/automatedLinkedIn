import { type OverlaySpec } from '../browsing/overlay'

// How today's LinkedIn marks itself up (seen on a real feed, 2026-10-19): the one place to fix when it changes.

// A post is one of these blocks, its pages are found by address, and its author is the one link that leads to a member or a company.
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

// How the post window is told open and closed, and what is said when it is not.
export const POST_WINDOW: OverlaySpec = {
   open: DIALOG,
   dismiss: DISMISS,
   avoid: NEVER_CLICK,
   says: {
      notClicked: 'The image of the post could not be clicked.',
      notOpened: 'The image did not open the post in a window.',
      notClosed: 'The window of the post would not close.',
   },
}

// The pages a post and a profile open as.
export const POST_PAGE = /\/(feed\/update|posts)\//
export const PROFILE_PAGE = /^\/(in|company)\//
