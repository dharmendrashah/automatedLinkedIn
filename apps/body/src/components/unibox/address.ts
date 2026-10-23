import { type Sort, type View } from './types'

export type Address = {
   conversationId?: string
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

// The state of the page kept in the address, so a refresh or a link keeps the conversation, the view, the search and the sort (the
// accounts picked can be many, so they are kept on the device instead).
export const parseAddress = (pathname: string, search: string): Address => {
   const params = new URLSearchParams(search)
   const conversationId = decode(pathname.split('/').filter(Boolean)[1])

   return {
      ...(conversationId && { conversationId }),
      view: viewOf(params.get('view')),
      query: (params.get('q') ?? '').slice(0, MAX_QUERY),
      sort: params.get('sort') === 'waiting' ? 'WAITING' : 'NEWEST',
   }
}

export const toAddress = ({ conversationId, view, query, sort }: Address) => {
   const params = new URLSearchParams()

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

   return `/unibox${conversationId ? `/${encodeURIComponent(conversationId)}` : ''}${text ? `?${text}` : ''}`
}
