import type { RouterOutputs } from '../../trpc'

export type OutputRow = RouterOutputs['workflow']['output']['items'][number]
export type RowItem = OutputRow['item']

// The fields that say where a row opens in the app. The server adds the person id and the company flag.
export type OpenTarget = {
   kind: string
   slug: string
   postId?: string | null
   personId?: string | null
   inApp?: boolean
}

export const nameOf = ({ item }: { item: RowItem }) => {
   switch (item.kind) {
      case 'post':
         return item.slug
      case 'job':
         return item.title ?? item.slug
      case 'ad':
         return item.headline ?? item.slug
      default:
         return item.name ?? item.slug
   }
}

// The author's name from the stored copy of a post; empty when there is no copy.
export const postDetailOf = (preview: { author: { name: string | null } } | null | undefined) =>
   preview?.author.name ?? ''

export const detailOf = ({ item }: { item: RowItem }) => {
   switch (item.kind) {
      case 'profile':
         return [item.headline, item.email, item.score === null ? null : `score ${item.score}`, ...item.tags]
            .filter(Boolean)
            .join(' · ')
      case 'company':
         return item.hiring.join(', ')
      case 'job':
         return [item.company, item.location, item.salary].filter(Boolean).join(' · ')
      case 'ad':
         return [item.advertiser, item.format].filter(Boolean).join(' · ')
      case 'conversation':
         return [item.lastFrom === 'ME' ? 'You wrote last' : item.lastFrom === 'THEM' ? 'They wrote last' : null, item.lastText]
            .filter(Boolean)
            .join(': ')
      case 'post':
         return postDetailOf(item.preview)
   }
}

// Where a row opens in the app, or null when it stays a link to LinkedIn.
export const internalPathOf = (item: OpenTarget): string | null => {
   switch (item.kind) {
      case 'post':
         return item.postId ? `/posts?post=${encodeURIComponent(item.slug)}` : null
      case 'profile':
         return item.personId ? `/network?open=${encodeURIComponent(item.personId)}` : null
      case 'company':
         return item.inApp ? `/companies?company=${encodeURIComponent(item.slug)}` : null
      default:
         return null
   }
}
