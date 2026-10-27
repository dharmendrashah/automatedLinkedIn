import { type HTMLElement, parse } from 'node-html-parser'

import { type Invitation } from '@automatedLinkedIn/contracts'

import {
   INVITATIONS_LIST,
   INVITATION_KEY,
   INVITATION_NAME,
   INVITATION_NOTE,
   INVITATION_REPLY,
   INVITATION_ROW,
} from './markup'
import { shown } from './messageReader'

// Everything here reads the markup of LinkedIn's connection requests (.plan/my-network-invitations.md) and nothing else: it holds
// no browser and no timing, so it is tested against pages made like the real one (`invitationFixture.ts`).

// Only LinkedIn's own picture host, over https: a placeholder drawn as a data address is no picture.
const PHOTO_HOST = 'https://media.licdn.com/'
const MUTUAL = /mutual connection/i
const SLUG = /\/in\/([^/?#]+)/

const slugOf = (href: string | undefined) => {
   const [, slug] = SLUG.exec(href ?? '') ?? []

   try {
      return slug ? decodeURIComponent(slug) : undefined
   } catch {
      return undefined
   }
}

// The name as the page writes it, without the badge that sits inside the same tag.
const nameOf = (row: HTMLElement) => {
   const strong = row.querySelector(INVITATION_NAME)

   return (
      strong?.childNodes
         .filter(node => node.nodeType === 3)
         .map(node => node.text)
         .join('')
         .trim() ?? ''
   )
}

const noteOf = (row: HTMLElement) => {
   const box = row.querySelector(INVITATION_NOTE)

   // The "show more" button sits inside the text's own tag; the rest of the text is already in the page.
   box?.querySelectorAll('button').forEach(button => button.remove())

   return shown(box)
}

// The first line that is not the name, the note, the reply link or the mutual connection is the headline.
const linesOf = (row: HTMLElement) =>
   row
      .querySelectorAll('p')
      .filter(
         line =>
            !line.querySelector(INVITATION_NAME) &&
            !line.querySelector(INVITATION_NOTE) &&
            !line.querySelector(INVITATION_REPLY)
      )
      .map(line => shown(line))
      .filter(text => text !== '')

const readRow = (row: HTMLElement): Invitation | undefined => {
   const [, id] = INVITATION_KEY.exec(row.getAttribute('componentkey') ?? '') ?? []
   const profile = row.querySelector('a[href*="/in/"]')
   const slug = slugOf(profile?.getAttribute('href'))
   const name = nameOf(row)

   if (!id || !slug || name === '') {
      return undefined
   }

   const lines = linesOf(row)
   const photo = profile?.querySelector('img')?.getAttribute('src')
   const mutual = lines.find(line => MUTUAL.test(line))
   const headline = lines.find(line => !MUTUAL.test(line))
   const note = noteOf(row)

   return {
      id,
      slug,
      name,
      headline: headline ?? '',
      ...(mutual && { mutual }),
      ...(note !== '' && { note }),
      ...(photo?.startsWith(PHOTO_HOST) && { photoUrl: photo }),
   }
}

// The number the page's own chip gives for all the received requests ("All (5)", beside "Verified (5)" and "Mutual Connections (3)";
// seen on /mynetwork/invitation-manager/, tripti.verma, 2026-10-27).
const ALL_CHIP = /^All \((\d{1,5})\)$/

const totalOf = (root: HTMLElement) => {
   for (const element of root.querySelectorAll('button, [role="tab"], [role="radio"], a, label, span')) {
      const [, count] = ALL_CHIP.exec(element.text.trim()) ?? []

      if (count) {
         return Number(count)
      }
   }

   return undefined
}

// What the list says when there is no request: "No new invitations", a paragraph inside the same list that holds the requests
// (seen on /mynetwork/invitation-manager/, dharmendrashaheagle+linkedin, 2026-10-27; English only). That account showed a single
// "Focused (0)" dropdown instead of the chips, so the chips are not the way to tell an empty list.
const NONE = /^No new invitations$/i

const emptyOf = (root: HTMLElement) =>
   root
      .querySelectorAll(INVITATIONS_LIST)
      .some(list => list.querySelectorAll('p').some(line => NONE.test(line.text.trim())))

// The requests the page draws now, in its order, each once. `rows` counts every row the page drew, so a row that could not be read
// shows as the difference. `empty` is the page's own word that there are none.
export const parseInvitations = (html: string) => {
   const root = parse(html)
   const rows = root.querySelectorAll(INVITATION_ROW)
   const seen = new Set<string>()
   const invitations: Invitation[] = []

   for (const row of rows) {
      const invitation = readRow(row)

      if (invitation && !seen.has(invitation.id)) {
         seen.add(invitation.id)
         invitations.push(invitation)
      }
   }

   const total = totalOf(root)

   return {
      invitations,
      rows: rows.length,
      empty: rows.length === 0 && emptyOf(root),
      ...(total !== undefined && { total }),
   }
}
