import { EXCERPT_LENGTH, type PersonItem, type PostItem, parseLinkedInUrl, person } from 'core'

// Turns the data service's rows into workflow items. Only the allow-listed fields survive; photos, ids and the
// supplier's field names stop here.

type Row = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const linkOf = (url: unknown) => {
   const raw = text(url)

   return raw ? parseLinkedInUrl(raw, 'profile') : null
}

export const ENRICH_BATCH = 25

export const commentersParams = (post: PostItem, howMany: number) => ({
   posts: post.url,
   maxResults: howMany,
})

export const reactorsParams = commentersParams

export const profilesParams = (people: PersonItem[]) => ({ queries: people.map(({ url }) => url) })

// People who commented, not companies and not the post's author.
export const commentersFrom = (rows: Row[], post: PostItem): PersonItem[] =>
   rows.flatMap(row => {
      const link = linkOf(row.commenterUrl)

      if (!link || row.commenterType === 'company' || row.isAuthor === true) {
         return []
      }

      return [
         person({
            ...link,
            name: text(row.commenterName),
            headline: text(row.commenterHeadline),
            followers: count(row.commenterFollowers),
            signals: [
               {
                  type: 'commented',
                  via: post.url,
                  at: text(row.commentedAt),
                  excerpt: text(row.comment)?.slice(0, EXCERPT_LENGTH) ?? null,
               },
            ],
         }),
      ]
   })

export const reactorsFrom = (rows: Row[], post: PostItem): PersonItem[] =>
   rows.flatMap(row => {
      const link = linkOf(row.reactorUrl)

      if (!link) {
         return []
      }

      return [
         person({
            ...link,
            name: text(row.reactorName),
            headline: text(row.reactorHeadline),
            location: text(row.reactorLocation),
            signals: [
               {
                  type: 'reacted',
                  via: post.url,
                  at: null,
                  excerpt: null,
               },
            ],
         }),
      ]
   })

const currentRole = (experience: unknown) => {
   const roles = Array.isArray(experience)
      ? experience.filter((role): role is Row => typeof role === 'object' && role !== null)
      : []
   const current =
      roles.find(role => !text(role.endDate) || text(role.endDate)?.toLowerCase() === 'present') ?? roles[0]

   return {
      title: text(current?.position),
      company: text(current?.companyName),
   }
}

// The full-profile fields kept for each person, by slug. A profile that does not exist simply has no entry.
export const profilesFrom = (rows: Row[]) =>
   new Map(
      rows.flatMap(row => {
         const link = linkOf(row.profileUrl) ?? linkOf(`https://www.linkedin.com/in/${text(row.handle) ?? ''}`)

         if (!link) {
            return []
         }

         const name = [text(row.firstName), text(row.lastName)].filter(Boolean).join(' ')
         const location = [text(row.city), text(row.state), text(row.country)].filter(Boolean).join(', ')

         return [
            [
               link.slug,
               {
                  name: name || null,
                  headline: text(row.headline),
                  location: location || null,
                  followers: count(row.followers),
                  ...currentRole(row.experience),
               },
            ],
         ]
      })
   )
