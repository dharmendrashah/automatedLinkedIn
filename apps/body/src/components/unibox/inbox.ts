import { type ConversationStatus, type Sort, type UniboxAccount, type UniboxConversation, type View } from './types'

import { fold, matches, tokensOf } from './search'
import { lastMessage, previewOf, statusOf, waitingSince } from './status'

export type Row = {
   conversation: UniboxConversation
   account: UniboxAccount | undefined
   status: ConversationStatus
   // When the newest message went; 0 for an empty conversation.
   lastAt: number
   waitingSince: number | undefined
   preview: ReturnType<typeof previewOf>
   draft: boolean
   // Lower case and without accents, built once so a search is only a look through text.
   searchText: string
}

export type Index = {
   rows: Row[]
   byId: Map<string, Row>
   // The conversations of one person (by profile link) across the accounts.
   byContact: Map<string, Row[]>
}

export type Filters = {
   view: View
   // undefined means every account.
   accountIds: ReadonlySet<string> | undefined
   query: string
}

// Everything a list, a count and a search need, built once per change of the data and not once per keystroke.
export const buildIndex = (
   accounts: UniboxAccount[],
   conversations: UniboxConversation[],
   drafts: ReadonlySet<string>
): Index => {
   const accountById = new Map(accounts.map(account => [account.id, account]))
   const rows = conversations.map((conversation): Row => {
      const account = accountById.get(conversation.accountId)

      const status = statusOf(conversation)

      return {
         conversation,
         account,
         status,
         lastAt: lastMessage(conversation)?.at ?? 0,
         waitingSince: status === 'DONE' ? undefined : waitingSince(conversation),
         preview: previewOf(conversation),
         draft: drafts.has(conversation.id),
         searchText: fold(
            [
               conversation.contact.name,
               account?.name,
               account?.handle,
               ...conversation.messages.map(message => message.text),
            ].join(' ')
         ),
      }
   })
   const byContact = new Map<string, Row[]>()

   for (const row of rows) {
      const { profileUrl } = row.conversation.contact

      if (profileUrl) {
         byContact.set(profileUrl, [...(byContact.get(profileUrl) ?? []), row])
      }
   }

   return {
      rows,
      byId: new Map(rows.map(row => [row.conversation.id, row])),
      byContact,
   }
}

const IN_VIEW: Record<View, (row: Row) => boolean> = {
   ALL: () => true,
   NEEDS_REPLY: row => row.status === 'NEEDS_REPLY',
   UNREAD: row => row.conversation.unread,
   REPLIED: row => row.status === 'REPLIED',
   DRAFTS: row => row.draft,
   FAILED: row => row.status === 'FAILED',
   DONE: row => row.status === 'DONE',
}

const inAccounts = (row: Row, accountIds: Filters['accountIds']) =>
   !accountIds || accountIds.has(row.conversation.accountId)

export const filterRows = (index: Index, { view, accountIds, query }: Filters) => {
   const tokens = tokensOf(query)

   return index.rows.filter(row => inAccounts(row, accountIds) && IN_VIEW[view](row) && matches(row.searchText, tokens))
}

// How many each view holds for the accounts picked. They follow the picked accounts, not the search, so the numbers do not jump
// while typing.
export const countsOf = (index: Index, accountIds: Filters['accountIds']): Record<View, number> => {
   const counts: Record<View, number> = {
      ALL: 0,
      NEEDS_REPLY: 0,
      UNREAD: 0,
      REPLIED: 0,
      DRAFTS: 0,
      FAILED: 0,
      DONE: 0,
   }

   for (const row of index.rows) {
      if (inAccounts(row, accountIds)) {
         for (const view of Object.keys(counts) as View[]) {
            counts[view] += IN_VIEW[view](row) ? 1 : 0
         }
      }
   }

   return counts
}

const MAIN_VIEWS: View[] = ['ALL', 'NEEDS_REPLY', 'UNREAD', 'REPLIED']
const SOMETIMES: View[] = ['DRAFTS', 'FAILED', 'DONE']

// The four main views always; Drafts, Failed and Done only while they hold something, and the view that is open stays.
export const visibleViews = (counts: Record<View, number>, active: View): View[] => [
   ...MAIN_VIEWS,
   ...SOMETIMES.filter(view => counts[view] > 0 || view === active),
]

// Newest message first, or what has waited longest first (then the rest, newest first). The list given is left as it is.
export const sortRows = (rows: Row[], sort: Sort) => {
   const newest = (a: Row, b: Row) => b.lastAt - a.lastAt

   if (sort === 'NEWEST') {
      return [...rows].sort(newest)
   }

   return [...rows].sort((a, b) => {
      if (a.waitingSince !== undefined && b.waitingSince !== undefined) {
         return a.waitingSince - b.waitingSince
      }

      if (a.waitingSince !== undefined || b.waitingSince !== undefined) {
         return a.waitingSince === undefined ? 1 : -1
      }

      return newest(a, b)
   })
}

// The same person in the conversations of the owner's other accounts. By profile link only: two people with one name are two people.
export const otherAccountsOf = (index: Index, conversation: UniboxConversation) => {
   const { profileUrl } = conversation.contact

   return profileUrl
      ? (index.byContact.get(profileUrl) ?? []).filter(row => row.conversation.id !== conversation.id)
      : []
}

// The next conversation that needs a reply after the one open, in the order of the list on screen, coming round to the start.
export const nextToReply = (rows: Row[], currentId: string | undefined) => {
   const at = rows.findIndex(row => row.conversation.id === currentId)
   const ordered = [...rows.slice(at + 1), ...rows.slice(0, at + 1)]

   return ordered.find(row => row.status === 'NEEDS_REPLY' && row.conversation.id !== currentId)?.conversation.id
}
