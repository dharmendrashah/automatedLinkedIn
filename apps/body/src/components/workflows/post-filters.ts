import { z } from 'zod'

// The filters a Posts block keeps as text: a copy of contracts' `postFiltersSchema` (contracts are not bundled into the page).
const filtersSchema = z.strictObject({
   read: z.enum(['READ', 'UNREAD']).optional(),
   minComments: z.number().int().min(1).max(1_000_000).optional(),
   minReactions: z.number().int().min(1).max(1_000_000).optional(),
   author: z.string().trim().min(1).max(100).optional(),
   hasQualified: z.boolean().optional(),
})

export type PostFilters = z.output<typeof filtersSchema>

// Text that does not fit is none.
export const readPostFilters = (text: string): PostFilters => {
   try {
      return filtersSchema.safeParse(JSON.parse(text || '{}')).data ?? {}
   } catch {
      return {}
   }
}

// Only what is on is kept.
export const postFiltersText = (filters: PostFilters) => {
   const on = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== false))

   return Object.keys(on).length > 0 ? JSON.stringify(on) : ''
}

export type PostChip = { key: keyof PostFilters; text: string }

// One removable chip per filter that is on.
export const postChips = (filters: PostFilters): PostChip[] => [
   ...(filters.read ? [{ key: 'read' as const, text: filters.read === 'READ' ? 'Read' : 'Not read yet' }] : []),
   ...(filters.minComments ? [{ key: 'minComments' as const, text: `${filters.minComments}+ comments` }] : []),
   ...(filters.minReactions ? [{ key: 'minReactions' as const, text: `${filters.minReactions}+ reactions` }] : []),
   ...(filters.author ? [{ key: 'author' as const, text: `Author: ${filters.author}` }] : []),
   ...(filters.hasQualified ? [{ key: 'hasQualified' as const, text: 'With qualified people' }] : []),
]
