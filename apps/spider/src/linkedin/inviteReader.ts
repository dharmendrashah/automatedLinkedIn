import { type HTMLElement, parse } from 'node-html-parser'

import {
   ADD_NOTE_WORDS,
   CONNECT_LINK,
   CONNECT_MEMBER,
   INVITE_BUTTON,
   INVITE_EMAIL,
   INVITE_LIMIT_WORDS,
   INVITE_NOTE_BOX,
   INVITE_QUESTION_WORDS,
   MORE_WORDS,
   NOTES_OUT_WORDS,
   NOTE_UPSELL,
   PENDING_LABEL,
   SEND_INVITE_WORDS,
   SEND_WITHOUT_NOTE_WORDS,
   SENT_ROW,
   SENT_ROW_WITHDRAW,
   WITHDRAW_DIALOG_BUTTON,
   WITHDRAW_WORDS,
} from './markup'

// The pages of an invite, read from their markup (.plan/network-invites.md). Pure, so each shape is tested on a fixture. The Connect
// link, the More menu, the window, the request and the Sent list with its withdraw window were seen (2026-10-30); the note box's
// markup and the notices were not.

const clean = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

// A button says these words in its name or its text.
const says = (element: HTMLElement, words: string) =>
   clean(element.getAttribute('aria-label')) === words || clean(element.text) === words

// A profile address after /in/, compared as LinkedIn may write it: percent-encoded or not, any case.
export const slugKey = (slug: string) => {
   try {
      return decodeURIComponent(slug).toLowerCase()
   } catch {
      return slug.toLowerCase()
   }
}

const vanityOf = (href: string) => {
   const [, query = ''] = href.split('?')

   return new URLSearchParams(query).get('vanityName') ?? ''
}

export type ProfileActions = {
   // Where the person's own Connect links stand among CONNECT_LINK (the numbers `clickNth` takes); the page holds the same link
   // more than once (2026-10-30: three times), and only one of them may be in view. Empty when none shows.
   connects: number[]
   // The same, in the open More menu (`role="menuitem"`), for a top card that shows only Follow, Message and More.
   menu: number[]
   memberId?: string
   // A button that says an invite is already on its way.
   pending: boolean
   // Something that only shows once the page has drawn its buttons.
   drawn: boolean
}

export const parseProfileActions = (html: string, slug: string, name: string): ProfileActions => {
   const root = parse(html)
   const links = root.querySelectorAll(CONNECT_LINK)
   const own = links.flatMap((link, index) =>
      slugKey(vanityOf(link.getAttribute('href') ?? '')) === slugKey(slug) ? [index] : []
   )
   const inMenu = (index: number) => links[index]?.getAttribute('role') === 'menuitem'
   const connects = own.filter(index => !inMenu(index))
   const menu = own.filter(inMenu)
   const [, memberId] = CONNECT_MEMBER.exec(links[own[0] ?? -1]?.getAttribute('componentkey') ?? '') ?? []
   const [first = ''] = name.toLowerCase().split(/\s+/)
   // The people suggested beside the profile may have invites of their own on their way, so the button must name this person.
   const pending = root.querySelectorAll('button, a').some(element => {
      const label = element.getAttribute('aria-label') ?? element.text.trim()

      return PENDING_LABEL.test(label) && first !== '' && label.toLowerCase().includes(first)
   })

   return {
      connects,
      menu,
      ...(memberId && { memberId }),
      pending,
      drawn: links.length > 0 || pending || root.querySelector('a[href*="/messaging/compose/"]') !== null,
   }
}

// The profile's own More buttons (sticky header and top card), as positions among INVITE_BUTTON. They open a menu and carry no name;
// the More of the site's top bar is named and is left out (2026-10-30).
export const moreButtons = (html: string) =>
   parse(html)
      .querySelectorAll(INVITE_BUTTON)
      .flatMap((button, index) =>
         clean(button.text) === MORE_WORDS &&
         button.getAttribute('aria-expanded') !== undefined &&
         !button.getAttribute('aria-label')
            ? [index]
            : []
      )

export type InviteDialog = {
   open: boolean
   // Positions among INVITE_BUTTON (every button of the page and its shadow roots); -1 when the button does not show.
   addNote: number
   sendWithoutNote: number
   // Send next to the note box; only looked for once the box shows, since other Send buttons may be on the page.
   send: number
   // Send waits for words in the box (seen on video, 2026-10-30).
   sendDisabled: boolean
   noteBox: boolean
   emailNeeded: boolean
   limitReached: boolean
   // LinkedIn offered Premium instead of the note box: the account has no free notes left this month.
   notesOut: boolean
}

// The window opens inside a shadow root whose markup was not kept, so nothing here depends on its container: its question, its
// buttons and its notices are found by their words.
export const parseInviteDialog = (html: string): InviteDialog => {
   const root = parse(html)
   const buttons = root.querySelectorAll(INVITE_BUTTON)
   const at = (words: string) => buttons.findIndex(button => says(button, words))
   const noteBox = root.querySelector(INVITE_NOTE_BOX) !== null
   const addNote = at(ADD_NOTE_WORDS)
   const sendWithoutNote = at(SEND_WITHOUT_NOTE_WORDS)
   const text = clean(root.querySelector('body')?.text ?? root.text)
   const send = noteBox ? buttons.findIndex(button => SEND_INVITE_WORDS.some(words => says(button, words))) : -1

   return {
      open: addNote >= 0 || sendWithoutNote >= 0 || text.includes(INVITE_QUESTION_WORDS),
      addNote,
      sendWithoutNote,
      send,
      sendDisabled: send >= 0 && buttons[send]?.getAttribute('disabled') !== undefined,
      noteBox,
      emailNeeded: root.querySelector(INVITE_EMAIL) !== null,
      limitReached: INVITE_LIMIT_WORDS.test(text),
      notesOut: root.querySelector(NOTE_UPSELL) !== null || NOTES_OUT_WORDS.test(text),
   }
}

// The person's Withdraw on the Sent list (a link, 2026-10-30), as a position among SENT_ROW_WITHDRAW; -1 when the row is not drawn.
// `rows` tells a list that drew from one that did not.
export const parseSentInvites = (html: string, slug: string) => {
   const root = parse(html)
   const rows = root.querySelectorAll(SENT_ROW)
   const withdraws = root.querySelectorAll(SENT_ROW_WITHDRAW)
   const row = rows.find(item =>
      item
         .querySelectorAll('a[href*="/in/"]')
         .some(link => slugKey(/\/in\/([^/?#]+)/.exec(link.getAttribute('href') ?? '')?.[1] ?? '') === slugKey(slug))
   )
   const control = row ? withdraws.find(element => row.querySelectorAll('a, button').includes(element)) : undefined

   return {
      rows: rows.length,
      withdraw: control ? withdraws.indexOf(control) : -1,
   }
}

// The confirm window "Withdraw invitation": whether it shows, and its Withdraw button (named after the person, saying Withdraw) as a
// position among WITHDRAW_DIALOG_BUTTON, -1 when it does not show.
export const withdrawConfirm = (html: string) =>
   parse(html)
      .querySelectorAll(WITHDRAW_DIALOG_BUTTON)
      .findIndex(button => clean(button.text) === WITHDRAW_WORDS)
