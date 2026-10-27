import { type NetworkRequest, type RequestState } from './types'

export type Filter = 'WAITING' | 'ACCEPTED' | 'IGNORED' | 'ATTENTION'

export const FILTERS: Array<{ key: Filter; label: string }> = [
   {
      key: 'WAITING',
      label: 'Waiting',
   },
   {
      key: 'ACCEPTED',
      label: 'Accepted',
   },
   {
      key: 'IGNORED',
      label: 'Ignored',
   },
   {
      key: 'ATTENTION',
      label: 'Needs a look',
   },
]

// Which chip a request is under. A request being answered is still waiting for the owner's eyes, so it stays under Waiting.
export const filterOf = (state: RequestState): Filter => {
   switch (state) {
      case 'WAITING':
      case 'QUEUED':
         return 'WAITING'
      case 'ACCEPTED':
         return 'ACCEPTED'
      case 'IGNORED':
         return 'IGNORED'
      default:
         return 'ATTENTION'
   }
}

export const countsOf = (requests: NetworkRequest[]): Record<Filter, number> => {
   const counts: Record<Filter, number> = {
      WAITING: 0,
      ACCEPTED: 0,
      IGNORED: 0,
      ATTENTION: 0,
   }

   for (const request of requests) {
      counts[filterOf(request.state)] += 1
   }

   return counts
}

// The requests under one chip that match what was typed (name, headline or the mutual connection), in the order LinkedIn gave.
// The Waiting chip also keeps a request answered in the last moments, so its result shows where the owner pressed the button
// instead of the row vanishing; it moves to its own chip a little later.
export const JUST_ANSWERED_MS = 20_000

export const visibleRequests = (requests: NetworkRequest[], filter: Filter, query: string, now: Date) => {
   const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
   const justAnswered = (request: NetworkRequest) =>
      request.answeredAt !== undefined && now.getTime() - new Date(request.answeredAt).getTime() < JUST_ANSWERED_MS

   return requests.filter(request => {
      if (filterOf(request.state) !== filter && !(filter === 'WAITING' && justAnswered(request))) {
         return false
      }

      const text = `${request.name} ${request.headline} ${request.mutual ?? ''}`.toLowerCase()

      return words.every(word => text.includes(word))
   })
}

// The person's own page, opened in a new tab. The slug is made safe for an address.
export const profileUrl = (slug: string) => `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`
