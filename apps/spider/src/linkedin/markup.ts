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

// The messages: the list of conversations, and a conversation's own page.
export const MESSAGING_PATH = '/messaging/'
export const THREAD_ID = /^\/messaging\/thread\/([^/]+)/
// What a person clicks to open a conversation of the list (a div, not a link), the rows whose pane scrolls the list, and the pane
// of the open conversation, which loads older messages as it is scrolled up.
export const INBOX_ROW = '.msg-conversation-listitem__link'
export const INBOX_LIST = '.msg-conversation-listitem'
export const THREAD_PANE = '.msg-s-message-list'
// Where a reply is written in the open conversation, and the button that sends it (disabled until there is text); recorded 2026-10-22.
export const COMPOSER = '.msg-form__contenteditable'
export const SEND_BUTTON = 'button.msg-form__send-button'
// The two hidden file inputs of the composer (recorded 2026-10-22): one takes images only, the other documents, video and images.
export const IMAGE_INPUT = 'input.msg-form__attachment-upload-input[accept="image/*"]'
export const FILE_INPUT = 'input.msg-form__attachment-upload-input[accept*=".pdf"]'
// The button after the beacon at the bottom of the list, for a page that does not load more by itself.
export const LOAD_MORE = '[data-test-msg-cross-pillar-visible-beacon] + button'

// The page where a post is written, the box its words go in (a rich-text editor; real key presses reach it) and the button that
// sends it, which is greyed until there are words and while it sends; recorded 2026-10-25.
export const POST_COMPOSE_PATH = '/sharing/compose'
export const POST_FEED_PATH = '/feed/'
export const POST_EDITOR = 'div[contenteditable="true"][componentkey="ShareBox_textEditor"]'
export const POST_BUTTON = 'button[data-view-name="share-post"]'
// The box on the feed that opens the composer (seen 2026-10-25); pressed when the compose address draws the feed and no window.
// Plain CSS: the hands look for it with `querySelectorAll`.
export const POST_START = 'div[aria-label="Start a post"]'
// The chips that say who sees the post and who may comment, and the rows their pop-ups offer. The comment rows have their own names
// (recorded 2026-10-25). The audience rows were only seen on video, so they are found by their words among the radio rows.
export const POST_AUDIENCE_CHIP = '[aria-label^="Post to "]'
export const POST_COMMENTS_CHIP = '[data-view-name="share-view-comment-controls-list"]'
export const POST_OPTION = '[role="radio"]'
export const POST_COMMENT_OPTIONS = {
   ANYONE: '[data-view-name="share-change-comment-anyone"]',
   CONNECTIONS: '[data-view-name="share-change-comment-connections"]',
   OFF: '[data-view-name="share-change-comment-no-one"]',
} as const
// The files of a post (recorded 2026-10-26). Media opens the "Editor" dialog for photos and a video; a document has its own dialog,
// reached through "Expand content types". LinkedIn adds a hidden file input to the end of the page each time a dialog opens, so the
// first one that matches is the one of the dialog just opened. The Editor's buttons have no names, so they are found by their words
// among the buttons of every dialog.
// The Media button has this name in both composer layouts; the one without data-view-names (2026-10-27) has nothing else.
export const POST_MEDIA_BUTTON = 'button[aria-label="Media"]'
export const POST_MORE_TYPES = 'button[aria-label="Expand content types"]'
export const POST_DOCUMENT_LINK = 'a[aria-label="Document"]'
export const POST_PHOTO_INPUT = 'input[type="file"][accept*="image/jpeg"]'
export const POST_VIDEO_INPUT = 'input[type="file"][accept*="video/"]'
export const POST_DOCUMENT_INPUT = 'input[type="file"][accept*="application/pdf"]'
export const POST_DIALOG_BUTTON = 'dialog button'
export const POST_DOCUMENT_TITLE = 'input[placeholder="Add a descriptive title to your document"]'
export const POST_DOCUMENT_DONE = 'button[data-view-name="media-document-share-confirm"]'
export const POST_PREVIEW_REMOVE = 'button[data-view-name="share-detour-preview-remove"]'

// The connection requests the account received, on the page that lists them all (/mynetwork/invitation-manager/, "Manage invitations",
// tabs Received and Sent, chips "All (5)", "Verified (5)" and "Mutual Connections (3)"; the page scrolls as a whole and draws
// "Suggestions for you" under the requests). Recorded 2026-10-27 on one account: each request is a `listitem` named by the request's
// own number, with two buttons whose names are English words ("Accept <Name>’s invitation" with the curly apostrophe, "Ignore an
// invitation to connect from <Name>"). The page's empty state and its layout on other accounts are not recorded.
export const INVITATIONS_PATH = '/mynetwork/invitation-manager/'
export const INVITATION_ROW = '[role="listitem"][componentkey^="urn:li:invitation:"]'
// The list that holds the requests, or the words that there are none.
export const INVITATIONS_LIST = '[data-testid="lazy-column"]'
export const INVITATION_KEY = /^urn:li:invitation:(\d{15,25})$/
export const INVITATION_NAME = 'a[aria-label^="View "] strong'
export const INVITATION_NOTE = '[data-testid="expandable-text-box"]'
// What the sender wrote is next to a link that opens a reply; neither is a headline.
export const INVITATION_REPLY = 'a[href*="/messaging/compose/"]'

// The button that answers one request, from the request's own number (digits only, so nothing else can reach a selector).
export const invitationButton = (id: string, action: 'ACCEPT' | 'IGNORE') => {
   if (!/^\d{15,25}$/.test(id)) {
      throw new Error('Not a request number')
   }

   return `[componentkey="urn:li:invitation:${id}"] button[aria-label^="${action === 'ACCEPT' ? 'Accept ' : 'Ignore an invitation'}"]`
}
