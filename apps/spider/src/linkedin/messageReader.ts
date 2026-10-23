import { type HTMLElement, type Node, parse } from 'node-html-parser'

import { type Message } from '@automatedLinkedIn/contracts'

import { COMPOSER, INBOX_ROW, SEND_BUTTON } from './markup'
import { parseClock, parseDay } from './when'

type Person = Message['sender']

// Everything here reads the markup of LinkedIn's messages (recorded 2026-10-22) and nothing else: it holds no browser and no
// timing, so it is tested against pages made like the real one (`messagingFixture.ts`).
const EVENT = 'li.msg-s-message-list__event'
const MESSAGE = '.msg-s-event-listitem'
const OTHER = 'msg-s-event-listitem--other'
const BODY = '.msg-s-event-listitem__body'
const BUBBLE = '.msg-s-event-listitem__message-bubble'

const clean = (text: string) =>
   text
      .replace(/[ \t\f\v\u00a0]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

// The text of a node as a person reads it: a line break is a line break, an emoji drawn as a picture is its description.
const textOf = (node: Node): string => {
   if (node.nodeType === 3) {
      return node.text
   }

   const element = node as HTMLElement

   if (element.tagName === 'BR') {
      return '\n'
   }

   if (element.tagName === 'IMG') {
      return element.getAttribute('alt') ?? ''
   }

   return element.childNodes.map(textOf).join('')
}

const shown = (element: HTMLElement | null) => (element ? clean(textOf(element)) : '')

const person = (name: string, profileUrl: string | undefined, imageUrl?: string): Person => ({
   name,
   ...(profileUrl && { profileUrl }),
   ...(imageUrl && { imageUrl }),
})

// Profile pictures the page draws, by the name in their alt text. Only LinkedIn's own image host is taken. A name with two different
// pictures (two people with one name) gets none, so a person is never shown with another's face.
const PHOTO_HOST = 'https://media.licdn.com/'
// A picture sent in a message is served from the private image path of linkedin.com itself (seen on staging, 2026-10-24), and only
// the account's own signed-in browser can download it.
const MESSAGE_PICTURE_PREFIXES = [PHOTO_HOST, 'https://www.linkedin.com/dms/prv/image/']
const PHOTOS =
   'img.presence-entity__image, img.msg-facepile-grid__img--person, img.msg-s-event-listitem__profile-picture'

const photosIn = (root: HTMLElement) => {
   const byName = new Map<string, string | undefined>()

   for (const image of root.querySelectorAll(PHOTOS)) {
      const name = image.getAttribute('alt')?.trim()
      const src = image.getAttribute('src')

      if (name && src?.startsWith(PHOTO_HOST)) {
         byName.set(name, byName.has(name) && byName.get(name) !== src ? undefined : src)
      }
   }

   return byName
}

// The account the page is signed in as: its name and picture, from the photo in the page's top bar.
export const parseOwner = (html: string): Person | undefined => {
   const image = parse(html).querySelector('img.global-nav__me-photo')
   const name = image?.getAttribute('alt')?.trim()
   const src = image?.getAttribute('src')

   return name ? person(name, undefined, src?.startsWith(PHOTO_HOST) ? src : undefined) : undefined
}

// What a message holds besides its words: only what the page shows. A picture carries the address LinkedIn serves it from (its own
// image hosts only), so the run can keep a copy; that address is a means to download and never leaves the spider.
export type ReadAttachment = Message['attachments'][number] & { url?: string }

const attachmentsOf = (item: HTMLElement): ReadAttachment[] =>
   (item.querySelector(BUBBLE)?.querySelectorAll('img') ?? [])
      .filter(image => !image.closest(BODY))
      .map(image => {
         const name = image.getAttribute('alt') ?? image.getAttribute('title')
         const src = image.getAttribute('src')

         return {
            kind: 'IMAGE' as const,
            ...(name && { name }),
            ...(src && MESSAGE_PICTURE_PREFIXES.some(prefix => src.startsWith(prefix)) && { url: src }),
         }
      })

export type ReadMessage = Omit<Message, 'attachments'> & { attachments: ReadAttachment[] }

// The messages as the contract has them. A picture's download address is a means for the run and never leaves the spider, and the
// contract is strict, so only the fields it knows are given on.
export const toContractMessages = (messages: ReadMessage[]): Message[] =>
   messages.map(message => ({
      ...message,
      attachments: message.attachments.map(({ kind, name, key, bytes }) => ({
         kind,
         ...(name !== undefined && { name }),
         ...(key !== undefined && { key }),
         ...(bytes !== undefined && { bytes }),
      })),
   }))

export const parseThread = (html: string, today: Date) => {
   const root = parse(html)
   const photos = photosIn(root)
   const title = shown(root.querySelector('.msg-entity-lockup__entity-title'))
   const headerProfile = root.querySelector('a.msg-thread__link-to-profile')?.getAttribute('href')
   const messages: ReadMessage[] = []
   const others = new Map<string, Person>()
   let day = ''
   let sender: Person | undefined
   let mine: Person | undefined

   for (const event of root.querySelectorAll(EVENT)) {
      day = shown(event.querySelector('time.msg-s-message-list__time-heading')) || day

      for (const item of event.querySelectorAll(MESSAGE)) {
         const direction = item.classList.contains(OTHER) ? 'THEM' : 'ME'
         const name = shown(item.querySelector('.msg-s-message-group__name'))
         const profile = item.querySelector('a.msg-s-event-listitem__link')?.getAttribute('href')
         const time = shown(item.querySelector('.msg-s-message-group__timestamp'))
         const text = shown(item.querySelector(BODY))

         // Only the first message of a group says who sent it; the rest of the group is the same person's.
         if (name) {
            const known = person(name, profile, photos.get(name))

            if (direction === 'THEM') {
               sender = known
            } else {
               mine = known
            }
         }

         const from =
            direction === 'THEM'
               ? (sender ?? person(title || 'Unknown', headerProfile, photos.get(title)))
               : (mine ?? person('Me', undefined))
         const when = [day, time].filter(Boolean).join(' ')
         const clock = parseClock(time)
         const date = parseDay(day, today)

         if (direction === 'THEM') {
            others.set(from.name, from)
         }

         messages.push({
            id: item.getAttribute('data-event-urn') ?? `${direction}:${when}:${text.slice(0, 40)}`,
            sender: from,
            direction,
            ...(date && { date }),
            ...(clock && { time: clock }),
            when,
            text,
            attachments: attachmentsOf(item),
         })
      }
   }

   const participants =
      others.size > 0 ? [...others.values()] : title ? [person(title, headerProfile, photos.get(title))] : []

   return {
      title,
      kind:
         participants.length > 1 || (messages.length === 0 && !headerProfile && title !== '')
            ? ('GROUP' as const)
            : ('DIRECT' as const),
      participants,
      messages,
   }
}

// The place to write in the open conversation: whether there is one, what is typed in it, and whether its send button can be
// pressed (it is disabled while the box is empty).
export const parseComposer = (html: string) => {
   const root = parse(html)
   const box = root.querySelector(COMPOSER)
   const send = root.querySelector(SEND_BUTTON)

   return {
      present: box !== null && send !== null,
      typed: shown(box),
      canSend: send !== null && !send.hasAttribute('disabled'),
   }
}

// Whether the newest message of a conversation is ours and holds these words, compared the way the page's text is cleaned.
export const newestIsOurs = (messages: Message[], text: string, before?: { id: string | undefined; count: number }) => {
   const last = messages.at(-1)

   if (last?.direction !== 'ME') {
      return false
   }

   // The newest message of the page before the send is not the one just sent, even when it holds the same words.
   if (before && last.id === before.id && messages.length <= before.count) {
      return false
   }

   return text === '' || clean(last.text) === clean(text)
}

// The markup of the place to write, with whatever is attached to it (empty when the page has none), to tell when it stops changing.
export const composerHtml = (html: string) => parse(html).querySelector('form.msg-form')?.outerHTML ?? ''

// The conversations the list shows, in page order, and whether the page may hold more than it shows (the beacon it keeps at the
// bottom of the list while it can load more).
export const parseInbox = (html: string) => {
   const root = parse(html)
   let drawn = 0

   // The page draws a row only while it is near the window and keeps an empty item in its place (recorded 2026-10-22: rows 10 to 12
   // of a fresh list were empty). Only drawn rows have something to click, and the Nth click target is the Nth drawn row.
   const rows = root.querySelectorAll('li.msg-conversation-listitem').map(item => {
      const hydrated = item.querySelector(INBOX_ROW) !== null

      return {
         title: shown(item.querySelector('.msg-conversation-listitem__participant-names')),
         when: shown(item.querySelector('.msg-conversation-listitem__time-stamp')),
         snippet: shown(item.querySelector('.msg-conversation-card__message-snippet')),
         unread: item.querySelector('.msg-conversation-card__message-snippet--unread') !== null,
         hydrated,
         linkIndex: hydrated ? drawn++ : undefined,
      }
   })

   return {
      rows,
      more: root.querySelector('[data-test-msg-cross-pillar-visible-beacon]') !== null,
   }
}
