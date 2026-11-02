import { z } from 'zod'

import { readFiltersText } from './filtersText'

// The filters of a Posts input block (.plan/input-blocks-filters.md), kept as one text so more can be added without new
// settings. All of them but the first look at the post's read; a post that was not read has none of them.
export const POST_READ_STATES = ['READ', 'UNREAD'] as const

export const postFiltersSchema = z.strictObject({
   read: z.enum(POST_READ_STATES).optional(),
   minComments: z.number().int().min(1).max(1_000_000).optional(),
   minReactions: z.number().int().min(1).max(1_000_000).optional(),
   author: z.string().trim().min(1).max(100).optional(),
   // Some person found from the post is Qualified.
   hasQualified: z.boolean().optional(),
})

export type PostFiltersInput = z.infer<typeof postFiltersSchema>

export const readPostFilters = (text: string) => readFiltersText(postFiltersSchema, text)
