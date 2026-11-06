// The structure of a post page an engage act opens, as recorded on 2026-11-03 and 2026-11-04 (en-US): the reaction control with its
// state in its label, the picker, the comment box, the Comment button under it (only once the box has words) and the comments.
// Names and words are made up.

export const ACTIVITY = '7000000000000000001'
export const KEY = `activity:${ACTIVITY}`
export const AUTHOR = 'Ada Example'

const REACTION_NAMES = ['Like', 'Celebrate', 'Support', 'Love', 'Insightful', 'Funny'] as const

export type PostState = {
   key: string
   author: string
   // 'no reaction', or the name of the reaction the control shows.
   reaction: string
   picker: boolean
   box: boolean
   // The words in the box.
   words: string
   // The words of each comment already on the post.
   comments: string[]
   // The Comment button is there but LinkedIn is still taking the words.
   busy: boolean
   // The Repost menu is open, with these items in order.
   menu: boolean
   menuItems: string[]
   // The compose page of a repost with thoughts is showing.
   compose: boolean
   // LinkedIn's "Repost successful" alert is on the page.
   reposted: boolean
   // The id of the comment whose reply box is open.
   replyOpen?: string
}

export const REPOST_MENU_ITEMS = ['Repost with thoughts', 'Repost instantly']
// The place of the compose page's Repost button among the buttons of type button (Dismiss comes first).
export const COMPOSE_REPOST_INDEX = 1
// The id of the comment at this place in the post's comments (its Reply button is the place among the Reply buttons).
export const commentIdOf = (index: number) => String(7000000000000100 + index)

export const postDefaults: PostState = {
   key: KEY,
   author: AUTHOR,
   reaction: 'no reaction',
   picker: false,
   box: true,
   words: '',
   comments: [],
   busy: false,
   menu: false,
   menuItems: [...REPOST_MENU_ITEMS],
   compose: false,
   reposted: false,
}

const picker = (open: boolean) =>
   open
      ? `<div data-floating-ui-portal=""><div popover="manual"><ul>${REACTION_NAMES.map(
           name => `<li><button type="button" aria-label="${name}"></button></li>`
        ).join('')}</ul></div></div>`
      : ''

const box = (present: boolean, words: string) =>
   present
      ? `<div data-testid="ui-core-tiptap-text-editor-wrapper"><div contenteditable="true" role="textbox" dir="auto" tabindex="0" aria-label="Text editor for creating comment"><p>${words}</p></div></div>`
      : ''

const submit = (show: boolean, busy: boolean) =>
   show
      ? `<div id="CgsIgMDHqPGpmujQAQ-commentButtonSectionND4Y5xV7blhcdzcHj6cz7BANwYwjE5atmETAQFEm47EFeedType_FEED_DETAIL"><button type="button"${busy ? ' disabled="" aria-busy="true"' : ''}><span>${busy ? 'Loading' : 'Comment'}</span></button></div>`
      : ''

const comments = (post: PostState) =>
   post.comments
      .map((text, index) => {
         const id = commentIdOf(index)
         const reply = post.replyOpen === id ? replyBox(post) : ''

         return `<div id="replaceableComment_urn:li:comment:(activity:${ACTIVITY},${id})"><span data-testid="expandable-text-box">${text}</span><button type="button" aria-label="Reply"></button></div>${reply}`
      })
      .join('')

// The reply box opens under its comment with the name of the person replied to, then the words.
const replyBox = (post: PostState) =>
   `<div contenteditable="true" role="textbox" dir="auto" tabindex="0" aria-label="Text editor for creating comment"><p><strong>Ada</strong>&nbsp;${post.words}</p></div><div id="replySection"><button type="button"${post.words === '' ? ' disabled=""' : ''}><span>Reply</span></button></div>`

const menu = (post: PostState) =>
   post.menu
      ? `<div popover="manual">${post.menuItems
           .map(item => `<div role="button" tabindex="0"><div><p><span>${item}</span></p></div></div>`)
           .join('')}</div>`
      : ''

const reposted = (show: boolean) =>
   show
      ? '<div role="alert" aria-live="polite"><p>Repost successful.<a href="https://www.linkedin.com/feed/update/urn:li:activity:7000000000000003/"><strong>View repost</strong></a></p></div>'
      : ''

const composePage = (post: PostState) =>
   [
      `<main><div contenteditable="true" role="textbox" dir="ltr" tabindex="0" componentkey="ShareBox_textEditor"><p>${post.words}</p></div>`,
      '<button type="button" aria-label="Dismiss"></button>',
      `<button type="button"${post.words === '' ? ' disabled=""' : ''}><span>Repost</span></button>`,
      '</main>',
   ].join('')

const postOnly = (post: PostState) =>
   [
      `<main><button type="button" aria-label="Open control menu for post by ${post.author}" aria-expanded="false"></button>`,
      `<div data-testid="ReactionFacepileCollection-urn:li:${post.key}"></div>`,
      `<button type="button" aria-label="Reaction button state: ${post.reaction}"></button>`,
      '<button type="button" aria-label="Open reactions menu" aria-expanded="false"></button>',
      '<button type="button" aria-label="Comment"></button>',
      picker(post.picker),
      box(post.box, post.replyOpen === undefined ? post.words : ''),
      submit(post.box && post.words !== '' && post.replyOpen === undefined, post.busy),
      comments(post),
      menu(post),
      reposted(post.reposted),
      '</main>',
   ].join('')

export const postPage = (post: PostState) => (post.compose ? composePage(post) : postOnly(post))
