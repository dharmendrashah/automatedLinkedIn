import { type Sort, type View } from './types'

export type Compose = {
   // The account the message goes from and the person it goes to (their profile slug), when the address names them.
   accountId?: string
   to?: string
}

export type Address = {
   conversationId?: string
   // Set while a new message is being written: the right pane is the New message view, not a conversation.
   compose?: Compose
   view: View
   query: string
   sort: Sort
}

const SLUGS: Record<View, string> = {
   ALL: 'all',
   NEEDS_REPLY: 'needs-reply',
   UNREAD: 'unread',
   REPLIED: 'replied',
   DRAFTS: 'drafts',
   FAILED: 'failed',
   DONE: 'done',
}

const MAX_QUERY = 200
const MAX_PART = 200
const COMPOSE = 'new'

const viewOf = (slug: string | null): View => (Object.keys(SLUGS) as View[]).find(view => SLUGS[view] === slug) ?? 'ALL'

const decode = (part: string | undefined) => {
   if (!part) {
      return undefined
   }

   try {
      return decodeURIComponent(part)
   } catch {
      return undefined
   }
}

const partOf = (value: string | null) => (value ? value.slice(0, MAX_PART) : undefined)

// The state of the page kept in the address, so a refresh or a link keeps the conversation, the view, the search and the sort (the
// accounts picked can be many, so they are kept on the device instead). `/unibox/new` is the New message view; the account and the
// person may be in its query (`account`, `to`), so a link can open it ready (conversation ids are never the word "new").
export const parseAddress = (pathname: string, search: string): Address => {
   const params = new URLSearchParams(search)
   const part = decode(pathname.split('/').filter(Boolean)[1])
   const account = partOf(params.get('account'))
   const to = partOf(params.get('to'))
   const common = {
      view: viewOf(params.get('view')),
      query: (params.get('q') ?? '').slice(0, MAX_QUERY),
      sort: params.get('sort') === 'waiting' ? ('WAITING' as const) : ('NEWEST' as const),
   }

   if (part === COMPOSE) {
      return {
         compose: {
            ...(account && { accountId: account }),
            ...(to && { to }),
         },
         ...common,
      }
   }

   return {
      ...(part && { conversationId: part }),
      ...common,
   }
}

export const toAddress = ({ conversationId, compose, view, query, sort }: Address) => {
   const params = new URLSearchParams()

   if (compose?.accountId) {
      params.set('account', compose.accountId)
   }

   if (compose?.to) {
      params.set('to', compose.to)
   }

   if (view !== 'ALL') {
      params.set('view', SLUGS[view])
   }

   if (query) {
      params.set('q', query.slice(0, MAX_QUERY))
   }

   if (sort === 'WAITING') {
      params.set('sort', 'waiting')
   }

   const text = params.toString()
   const path = compose ? `/${COMPOSE}` : conversationId ? `/${encodeURIComponent(conversationId)}` : ''

   return `/unibox${path}${text ? `?${text}` : ''}`
}
