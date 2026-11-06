import { type HTMLElement, parse } from 'node-html-parser'

const STATE_PREFIX = 'Reaction button state: '
const EDITOR_LABEL = 'Text editor for creating comment'
const SUBMIT_SECTION = 'commentButtonSection'
const COMMENT_ID = 'replaceableComment_urn:li:comment:('
const REPLY_BUTTON = 'Reply'
const ACTIVITY_IN_BAR = /ReactionFacepileCollection-urn:li:activity:(\d{10,25})/
// LinkedIn cuts a long comment with "...more", so only the start of its words is looked for.
const COMMENT_START = 40
export const REPOST_MENU = {
   thoughts: 'Repost with thoughts',
   instantly: 'Repost instantly',
} as const
const REPOST_SAID = 'Repost successful'
const REPOST_BUTTON = 'Repost'

// Spaces are ignored, because a line break in a comment can come back as a paragraph.
const squash = (value: string) => value.replace(/\s+/g, '')

const labelled = (html: string) =>
   parse(html)
      .querySelectorAll('button')
      .map(button => button.getAttribute('aria-label') ?? '')

// What the post's reaction control shows: "no reaction", or the reaction it shows; undefined when the control is not on the page.
export const reactionStateOf = (html: string) =>
   labelled(html)
      .find(label => label.startsWith(STATE_PREFIX))
      ?.slice(STATE_PREFIX.length)

// The post's own activity key, read from its reaction bar; undefined when the bar is not on the page, so the act is not taken.
export const activityKeyOf = (html: string) => {
   const id = ACTIVITY_IN_BAR.exec(html)?.[1]

   return id === undefined ? undefined : `activity:${id}`
}

// Whether the page shows this post, and by this author when one is given. The activity id is in the post's reaction bar.
export const postIsOn = (html: string, key: string, author?: string) =>
   html.includes(`urn:li:${key}`) &&
   (author === undefined || labelled(html).includes(`Open control menu for post by ${author}`))

// The words in the comment box, or undefined when the post has no box.
export const commentBoxOf = (html: string) => {
   const box = parse(html)
      .querySelectorAll('[aria-label]')
      .find(
         element =>
            element.getAttribute('aria-label') === EDITOR_LABEL && element.getAttribute('contenteditable') === 'true'
      )

   return box ? { words: box.textContent.trim() } : undefined
}

// Whether the Comment button under the box is there and LinkedIn takes a press on it.
export const submitEnabled = (html: string) => {
   const section = parse(html)
      .querySelectorAll('div')
      .find(element => (element.getAttribute('id') ?? '').includes(SUBMIT_SECTION))
   const button = section?.querySelector('button')

   return button !== undefined && button !== null && !button.hasAttribute('disabled')
}

// How many comments of the post say these words, so a comment just posted can be told from one that was there before.
export const commentsSaying = (html: string, words: string) => {
   const target = squash(words).slice(0, COMMENT_START)

   return parse(html)
      .querySelectorAll('[id]')
      .filter(
         element =>
            (element.getAttribute('id') ?? '').startsWith(COMMENT_ID) && squash(element.textContent).includes(target)
      ).length
}

const textOf = (element: HTMLElement) => element.textContent.replace(/\s+/g, ' ').trim()

// Whether the reaction popover is open and offers this reaction.
export const pickerShows = (html: string, label: string) =>
   parse(html)
      .querySelectorAll('[data-floating-ui-portal] button')
      .some(button => button.getAttribute('aria-label') === label)

// The place of a menu item (by its start) among the menu items, in the order a press counts them; -1 when the menu is shut or lacks it.
export const repostMenuIndexOf = (html: string, item: string = REPOST_MENU.thoughts) =>
   parse(html)
      .querySelectorAll('[popover] [role="button"]')
      .findIndex(element => textOf(element).startsWith(item))

// The place of the compose page's Repost button among the buttons of type button; -1 while that button is disabled.
export const repostSubmitIndexOf = (html: string) => {
   const buttons = parse(html).querySelectorAll('button[type="button"]')
   const index = buttons.findIndex(
      button => button.getAttribute('aria-label') === undefined && textOf(button) === REPOST_BUTTON
   )
   const button = index < 0 ? undefined : buttons[index]

   return button !== undefined && !button.hasAttribute('disabled') ? index : -1
}

// Whether LinkedIn shows that the repost went.
export const repostedOn = (html: string) =>
   parse(html)
      .querySelectorAll('[role="alert"]')
      .some(alert => textOf(alert).includes(REPOST_SAID))

// Whether the compose page of a post is on the page.
export const composerOn = (html: string) =>
   parse(html).querySelectorAll('[componentkey="ShareBox_textEditor"]').length > 0

const isReplyButton = (element: HTMLElement) =>
   element.tagName === 'BUTTON' && element.getAttribute('aria-label') === REPLY_BUTTON
const isTypeButton = (element: HTMLElement) => element.tagName === 'BUTTON' && element.getAttribute('type') === 'button'
const isBox = (element: HTMLElement) =>
   element.getAttribute('aria-label') === EDITOR_LABEL &&
   element.getAttribute('contenteditable') === 'true' &&
   element.getAttribute('role') === 'textbox'

// Where a comment's reply controls are, as the presses count them: its Reply button, the reply box that opens under it (the first box after
// the Reply button, with no other comment between them), and its Reply button once that is enabled. Undefined when the comment is not on the page.
export const replyPlaceOf = (html: string, commentId: string) => {
   const all = parse(html).querySelectorAll('*')
   const idOf = (element: HTMLElement) => element.getAttribute('id') ?? ''
   const start = all.findIndex(
      element => idOf(element).startsWith(COMMENT_ID) && idOf(element).endsWith(`,${commentId})`)
   )

   if (start < 0) {
      return undefined
   }

   const replyAt = all.findIndex((element, index) => index > start && isReplyButton(element))

   if (replyAt < 0) {
      return undefined
   }

   const count = (position: number, match: (element: HTMLElement) => boolean) =>
      all.slice(0, position).filter(match).length
   const boxAt = all.findIndex((element, index) => index > replyAt && isBox(element))
   const submitAt =
      boxAt < 0
         ? -1
         : all.findIndex(
              (element, index) =>
                 index > boxAt &&
                 isTypeButton(element) &&
                 textOf(element) === REPLY_BUTTON &&
                 !element.hasAttribute('disabled')
           )

   return {
      reply: count(replyAt, isReplyButton),
      editor: boxAt < 0 ? undefined : count(boxAt, isBox),
      submit: submitAt < 0 ? undefined : count(submitAt, isTypeButton),
   }
}
