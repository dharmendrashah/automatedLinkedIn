import { type HTMLElement, parse } from 'node-html-parser'

import { type Connection, connectionSchema, connectionSlugSchema } from '@automatedLinkedIn/contracts'

import { CONNECTIONS_HEADER, CONNECTION_MESSAGE, CONNECTION_PROFILE, CONNECTION_ROW } from './markup'
import { shown } from './messageReader'

// Everything here reads the markup of LinkedIn's connections list (.plan/my-connections.md) and nothing else: it holds no browser and
// no timing, so it is tested against pages made like the real one (`connectionFixture.ts`).

// Only LinkedIn's own picture host, over https: a placeholder drawn as a data address is no picture.
const PHOTO_HOST = 'https://media.licdn.com/'
const SLUG = /\/in\/([^/?#]+)/
// "Connected on October 27, 2026" (English; a line in another language gives no day, never a wrong one).
const CONNECTED = /^Connected on ([A-Z][a-z]+) (\d{1,2}), (\d{4})$/
const MONTHS = [
   'January',
   'February',
   'March',
   'April',
   'May',
   'June',
   'July',
   'August',
   'September',
   'October',
   'November',
   'December',
]
// The heading above the list: "115 connections" (or "1 connection").
const TOTAL = /^(\d{1,3}(?:[,.]\d{3})*|\d+) connections?$/

// The address as the page writes it, not decoded: it is what the row is named after, and what a selector is built from.
const slugOf = (href: string | undefined) => {
   const [, slug] = SLUG.exec(href ?? '') ?? []

   return connectionSlugSchema.safeParse(slug).success ? slug : undefined
}

const dayOf = (line: string) => {
   const [, month, day, year] = CONNECTED.exec(line) ?? []
   const index = MONTHS.indexOf(month ?? '')

   return index < 0 ? undefined : `${year}-${String(index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const messageUrnOf = (row: HTMLElement) => {
   const href = row.querySelector(CONNECTION_MESSAGE)?.getAttribute('href')
   const urn =
      href && URL.canParse(href, 'https://www.linkedin.com')
         ? new URL(href, 'https://www.linkedin.com').searchParams.get('profileUrn')
         : null
   const checked = connectionSchema.shape.messageUrn.safeParse(urn ?? undefined)

   return checked.success ? checked.data : undefined
}

const readRow = (row: HTMLElement): Connection | undefined => {
   const links = row.querySelectorAll(CONNECTION_PROFILE)
   const slug = slugOf(links[0]?.getAttribute('href'))
   // The name link is the one with text in it; the photo link has none. The name is the first line, the headline the second.
   const [name = '', headline = ''] = (links.find(link => link.querySelector('p')) ?? links[0] ?? row)
      .querySelectorAll('p')
      .map(line => shown(line))
   const connectedOn = row
      .querySelectorAll('p')
      .map(line => dayOf(shown(line)))
      .find(day => day !== undefined)
   const photo = links[0]?.querySelector('img')?.getAttribute('src')
   const urn = messageUrnOf(row)

   if (!slug || name === '') {
      return undefined
   }

   return {
      slug,
      name,
      headline,
      ...(connectedOn && { connectedOn }),
      ...(photo?.startsWith(PHOTO_HOST) && { photoUrl: photo }),
      ...(urn && { messageUrn: urn }),
   }
}

const totalOf = (root: HTMLElement) => {
   for (const line of root.querySelectorAll(`${CONNECTIONS_HEADER} p`)) {
      const [, count] = TOTAL.exec(shown(line)) ?? []

      if (count) {
         return Number(count.replace(/[,.]/g, ''))
      }
   }

   return undefined
}

// The connections the page draws now, in its order, each once. `rows` counts every row the page drew, so a row that could not be
// read shows as the difference. `empty` is the page's own word (a heading that says 0) that there are none.
export const parseConnections = (html: string) => {
   const root = parse(html)
   const rows = root.querySelectorAll(CONNECTION_ROW)
   const seen = new Set<string>()
   const connections: Connection[] = []

   for (const row of rows) {
      const connection = readRow(row)

      if (connection && !seen.has(connection.slug)) {
         seen.add(connection.slug)
         connections.push(connection)
      }
   }

   const total = totalOf(root)

   return {
      rows: rows.length,
      connections,
      ...(total !== undefined && { total }),
      empty: total === 0,
   }
}
