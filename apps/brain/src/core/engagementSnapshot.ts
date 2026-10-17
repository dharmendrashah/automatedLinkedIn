import { z } from 'zod'

import { parseLinkedInUrl } from './linkedInUrl'
import { type Row, count, httpsLink, rows, text } from './snapshotFields'

// The comments or reactions on a post the owner chose to read. Only a profile link gets a slug, so only people can be
// opened or added to a list; a company commenter keeps its link only.

// LinkedIn's own limit on a comment's length.
const COMMENT_LENGTH = 1_250

const who = (value: unknown) => {
   const link = httpsLink(value)
   const profile = link ? parseLinkedInUrl(link, 'profile') : null

   return {
      slug: profile?.slug ?? null,
      url: profile?.url ?? link,
   }
}

const nullable = z.string().nullable()

const commentSchema = z.object({
   slug: nullable,
   url: nullable,
   name: nullable,
   headline: nullable,
   photo: nullable,
   followers: z.number().nullable(),
   isAuthor: z.boolean(),
   isCompany: z.boolean(),
   text: nullable,
   at: nullable,
   reactions: z.number(),
})

const reactionSchema = z.object({
   slug: z.string(),
   url: z.string(),
   name: nullable,
   headline: nullable,
   photo: nullable,
   location: nullable,
   type: nullable,
})

const commentsSchema = z.object({
   limit: z.number(),
   items: z.array(commentSchema),
})

const reactionsSchema = z.object({
   limit: z.number(),
   items: z.array(reactionSchema),
})

export type CommentsSnapshotData = z.infer<typeof commentsSchema>
export type ReactionsSnapshotData = z.infer<typeof reactionsSchema>

export const commentsSnapshotFrom = (data: unknown[], limit: number): CommentsSnapshotData => ({
   limit,
   items: rows(data).map((row: Row) => ({
      ...who(row.commenterUrl),
      name: text(row.commenterName),
      headline: text(row.commenterHeadline),
      photo: httpsLink(row.commenterPhoto),
      followers: count(row.commenterFollowers),
      isAuthor: row.isAuthor === true,
      isCompany: text(row.commenterType)?.toLowerCase() === 'company',
      text: text(row.comment, COMMENT_LENGTH),
      at: text(row.commentedAt, 40),
      reactions: rows(row.commentReactions).reduce((sum, reaction) => sum + (count(reaction.count) ?? 0), 0),
   })),
})

// A reaction without a profile link tells nothing about who it was, so it is left out.
export const reactionsSnapshotFrom = (data: unknown[], limit: number): ReactionsSnapshotData => ({
   limit,
   items: rows(data).flatMap((row: Row) => {
      const { slug, url } = who(row.reactorUrl)

      return slug && url
         ? [
              {
                 slug,
                 url,
                 name: text(row.reactorName),
                 headline: text(row.reactorHeadline),
                 photo: httpsLink(row.reactorPhoto),
                 location: text(row.reactorLocation),
                 type: text(row.reactionType, 40),
              },
           ]
         : []
   }),
})

export const readCommentsSnapshot = (data: unknown): CommentsSnapshotData | null =>
   commentsSchema.safeParse(data).data ?? null

export const readReactionsSnapshot = (data: unknown): ReactionsSnapshotData | null =>
   reactionsSchema.safeParse(data).data ?? null
