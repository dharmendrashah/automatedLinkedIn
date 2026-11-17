import { moreButtons, parseProfileActions } from '../linkedin/inviteReader'

export type PageRow = {
   page: string
   slug: string
   more: number
   connects: number
   menu: number
   pending: boolean
   drawn: boolean
}

type Person = {
   slug: string
   name: string
}

// Runs the invite readers over kept pages; `people[i]` is the person of `pages[i]` (none: read by its Connect links only).
export const checkPages = (pages: Array<{ name: string; html: string }>, people: Person[]): PageRow[] =>
   pages.map(({ name, html }, index) => {
      const { slug = '', name: person = '' } = people[index] ?? {}
      const actions = parseProfileActions(html, slug, person)

      return {
         page: name,
         slug,
         more: moreButtons(html).length,
         connects: actions.connects.length,
         menu: actions.menu.length,
         pending: actions.pending,
         drawn: actions.drawn,
      }
   })

const parsed = (text: string): unknown => {
   try {
      return JSON.parse(text)
   } catch {
      return undefined
   }
}

const listOf = (value: unknown, key: string): Array<Record<string, unknown>> | undefined => {
   const list = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

   return Array.isArray(list) ? list : undefined
}

const numberOf = (name: string) => Number(/(\d+)/.exec(name)?.[1] ?? 0)

// The people a run answered NO_CONNECT, in order, and their kept pages (`no-connect-<n>.html`), in the same order.
export const pair = (inputText: string, invitesText: string, files: string[]) => {
   const send = listOf(parsed(inputText), 'send')
   const sent = listOf(parsed(invitesText), 'sent')

   if (!send) {
      return { error: 'input.json has no "send" list.' }
   }

   if (!sent) {
      return { error: 'invites.json has no "sent" list.' }
   }

   const people = sent.flatMap(({ id, outcome }) => {
      const asked = send.find(entry => entry.id === id)

      return outcome === 'NO_CONNECT' && typeof asked?.slug === 'string'
         ? [
              {
                 slug: asked.slug,
                 name: typeof asked.name === 'string' ? asked.name : '',
              },
           ]
         : []
   })
   const pages = files
      .filter(file => /^no-connect-\d+\.html$/.test(file))
      .toSorted((left, right) => numberOf(left) - numberOf(right))

   if (pages.length !== people.length) {
      return { error: `${people.length} people were answered no Connect but ${pages.length} kept pages were found.` }
   }

   return {
      people,
      pages,
   }
}
