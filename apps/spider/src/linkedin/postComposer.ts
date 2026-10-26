import { type HTMLElement, parse } from 'node-html-parser'

import { postLinkOf } from '@automatedLinkedIn/contracts'

import {
   POST_BUTTON,
   POST_DIALOG_BUTTON,
   POST_DOCUMENT_DONE,
   POST_DOCUMENT_TITLE,
   POST_EDITOR,
   POST_OPTION,
   POST_PREVIEW_REMOVE,
} from './markup'

const SUCCESS_WINDOW = 'your post was successful'
const SUCCESS_TOAST = 'post successful'
const AUDIENCE_PREFIX = 'Post to '
const COMMENTS_PREFIX = 'Comments: '

export type PostComposer = {
   // The box and the Post button are both there.
   present: boolean
   // Who the post goes to as the page names it ("Anyone", "Connections only"); empty when it names none.
   audience: string
   // Who may comment, as the page names it ("Anyone", "Connections only", "Off"); empty when it names none.
   comments: string
   // The words in the box, one line per paragraph.
   typed: string
   // A file (photos, a video, a document) is attached and shown with its remove button.
   attachment: boolean
   canPost: boolean
   // Post was pressed and the page is sending: the button is greyed and says so.
   busy: boolean
   // Where Post is among the buttons of every dialog, for a click by order, when the page gives it no name of its own; -1 otherwise.
   postIndex: number
}

// What the page shows of the post composer (recorded 2026-10-25). The words are read, never logged.
export const parsePostComposer = (html: string): PostComposer => {
   const root = parse(html)
   const editor = root.querySelector(POST_EDITOR)
   const byName = root.querySelector(POST_BUTTON)
   // Some accounts get a composer whose buttons carry no names (2026-10-27): Post is then the button of the box's dialog that says so.
   const byWords = byName
      ? undefined
      : editor
           ?.closest('dialog')
           ?.querySelectorAll('button')
           .find(found => found.text.trim() === 'Post')
   const button = byName ?? byWords
   const postIndex = byWords ? root.querySelectorAll(POST_DIALOG_BUTTON).indexOf(byWords) : -1
   const labels = root.querySelectorAll('[aria-label]').map(element => element.getAttribute('aria-label') ?? '')
   const named = (prefix: string) =>
      labels
         .find(value => value.startsWith(prefix))
         ?.slice(prefix.length)
         .trim() ?? ''

   return {
      present: Boolean(editor && button),
      audience: named(AUDIENCE_PREFIX),
      comments: named(COMMENTS_PREFIX),
      typed:
         editor
            ?.querySelectorAll('p')
            .map(paragraph => paragraph.text.trim())
            .join('\n')
            .trim() ?? '',
      attachment: Boolean(root.querySelector(POST_PREVIEW_REMOVE)),
      canPost: Boolean(button) && !button?.hasAttribute('disabled'),
      busy: button?.getAttribute('aria-busy') === 'true',
      postIndex,
   }
}

// The words of the rows a pop-up of the composer offers (who can see the post), in the order the page lists them: the first words of
// each radio row. Empty when no pop-up is open.
export const parsePostOptions = (html: string) =>
   parse(html)
      .querySelectorAll(POST_OPTION)
      .map(row => row.querySelector('p')?.text.trim() ?? '')

const REFUSED_WORDS = ['something went wrong', 'not supported']

const dialogTitled = (root: ReturnType<typeof parse>, title: string) =>
   root.querySelectorAll('dialog').find(found => found.querySelector('h1,h2')?.text.trim() === title)

export type EditorDialog = {
   open: boolean
   // The upload finished: Next is there and not greyed.
   ready: boolean
   // LinkedIn said the file is not supported.
   refused: boolean
   // Where Next is among the buttons of every dialog of the page (for a click by order); -1 when there is none.
   nextIndex: number
}

// The "Editor" dialog that takes photos and a video: LinkedIn greys Next until the upload has finished.
export const parseEditorDialog = (html: string): EditorDialog => {
   const root = parse(html)
   const dialog = dialogTitled(root, 'Editor')
   const next = dialog?.querySelectorAll('button').find(found => found.text.trim() === 'Next')

   return {
      open: Boolean(dialog),
      ready: Boolean(next) && !next?.hasAttribute('disabled') && next?.getAttribute('aria-busy') !== 'true',
      refused: REFUSED_WORDS.some(words => dialog?.text.toLowerCase().includes(words)),
      nextIndex: next ? root.querySelectorAll(POST_DIALOG_BUTTON).indexOf(next) : -1,
   }
}

export type DocumentDialog = {
   open: boolean
   // A file was chosen (its title field is drawn) and Done is not greyed.
   ready: boolean
   refused: boolean
   // Where Done is among the buttons of every dialog of the page, for a click by order, when the page gives it no name of its own; -1 otherwise.
   doneIndex: number
}

// The "Share a document" dialog: its title field is drawn once a file was chosen, and Done is greyed until the upload has finished.
export const parseDocumentDialog = (html: string): DocumentDialog => {
   const root = parse(html)
   const dialog = dialogTitled(root, 'Share a document')
   const byName = dialog?.querySelector(POST_DOCUMENT_DONE)
   // The layout whose buttons carry no names (2026-10-27) has Done as the button that says so.
   const byWords = byName ? undefined : dialog?.querySelectorAll('button').find(found => found.text.trim() === 'Done')
   const done = byName ?? byWords

   return {
      open: Boolean(dialog),
      ready: Boolean(dialog?.querySelector(POST_DOCUMENT_TITLE)) && Boolean(done) && !done?.hasAttribute('disabled'),
      refused: REFUSED_WORDS.some(words => dialog?.text.toLowerCase().includes(words)),
      doneIndex: byWords ? root.querySelectorAll(POST_DIALOG_BUTTON).indexOf(byWords) : -1,
   }
}

export type PostResult = {
   posted: boolean
   // The post's own address, only when the page gave one that passes `postLinkOf`.
   link?: string
}

// Whether the page says the post went, and where to open it. Only the "View post" links of that message count: the feed behind it
// is full of other people's posts.
export const parsePostResult = (html: string): PostResult => {
   const root = parse(html)
   const alert = root.querySelectorAll('[role="alert"]').find(found => found.text.toLowerCase().includes(SUCCESS_TOAST))
   const window = root
      .querySelectorAll('p')
      .find(found => found.text.trim().toLowerCase() === SUCCESS_WINDOW)?.parentNode
   const posted = Boolean(alert || window)

   if (!posted) {
      return { posted }
   }

   const viewPost = (scope: HTMLElement | null | undefined) =>
      scope
         ?.querySelectorAll('a')
         .filter(anchor => anchor.text.trim().toLowerCase() === 'view post')
         .map(anchor => postLinkOf(anchor.getAttribute('href')))
         .find(link => link !== undefined)
   const link = viewPost(alert) ?? viewPost(window)

   return link
      ? {
           posted,
           link,
        }
      : { posted }
}
