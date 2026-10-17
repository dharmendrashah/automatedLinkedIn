import { type CompanyItem, EXCERPT_LENGTH, type PersonItem, type PostItem, parseLinkedInUrl, person } from 'core'

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

         return [[link.slug, cardOf(row)]]
      })
   )

const cardOf = (row: Row) => {
   const name = [text(row.firstName), text(row.lastName)].filter(Boolean).join(' ')
   const location = [text(row.city), text(row.state), text(row.country)].filter(Boolean).join(', ')

   return {
      name: name || null,
      headline: text(row.headline),
      location: location || null,
      followers: count(row.followers),
      ...currentRole(row.experience),
   }
}

const postLinkOf = (url: unknown) => {
   const raw = text(url)
   const link = raw ? parseLinkedInUrl(raw, 'post') : null

   return link && raw
      ? {
           slug: link.slug,
           url: raw.split('?')[0],
        }
      : null
}

// Posts the data service found; they are not in the owner's posts list, so they are never marked done.
export const postsFrom = (rows: Row[]): PostItem[] =>
   rows.flatMap(row => {
      const link = postLinkOf(row.postUrl)
      const author = linkOf(row.postAuthorUrl ?? row.authorUrl ?? row.authorProfileUrl)

      return link
         ? [
              {
                 kind: 'post' as const,
                 ...link,
                 postId: null,
                 author: author?.url ?? null,
              },
           ]
         : []
   })

export const findPostsParams = (config: { keywords: string; postedWithin: string; howMany: number }) => ({
   queries: config.keywords,
   postedLimit: config.postedWithin,
   maxResults: config.howMany,
})

export const postsOfParams = (url: string, howMany: number) => ({
   urls: url,
   maxResults: howMany,
})

export const engagedParams = (person: PersonItem, howMany: number) => ({
   profiles: person.url,
   maxResults: howMany,
})

export const employeesParams = (
   company: CompanyItem,
   config: { howMany: number; titles: string[]; seniority: string[] }
) => ({
   companies: company.url,
   maxResults: config.howMany,
   ...(config.titles.length > 0 ? { jobTitles: config.titles } : {}),
   ...(config.seniority.length > 0 ? { seniorityLevels: config.seniority } : {}),
})

// Employees come with their full profile, so they are not read again. A hiring company adds its roles as a reason.
export const employeesFrom = (rows: Row[], company: CompanyItem): PersonItem[] =>
   rows.flatMap(row => {
      const link = linkOf(row.profileUrl) ?? linkOf(`https://www.linkedin.com/in/${text(row.handle) ?? ''}`)

      if (!link) {
         return []
      }

      return [
         person({
            ...link,
            ...cardOf(row),
            enriched: true,
            signals: [
               {
                  type: company.hiring.length > 0 ? 'hiring' : 'employee',
                  via: company.url,
                  at: null,
                  excerpt:
                     company.hiring.length > 0 ? company.hiring.join(', ').slice(0, EXCERPT_LENGTH) : company.name,
               },
            ],
         }),
      ]
   })

export const jobsParams = (companies: CompanyItem[], config: { jobTitle: string; howMany: number }) => ({
   jobTitles: config.jobTitle,
   company: companies.map(({ name, slug }) => name ?? slug),
   maxResults: config.howMany,
})

const companyLinkOf = (url: unknown) => {
   const raw = text(url)

   return raw ? parseLinkedInUrl(raw, 'company') : null
}

// The open roles found per company, matched by the company link or, failing that, by name.
export const hiringFrom = (rows: Row[], companies: CompanyItem[]) => {
   const roles = new Map<string, string[]>()

   for (const row of rows) {
      const slug = companyLinkOf(row.companyUrl)?.slug
      const name = text(row.companyName)?.toLowerCase()
      const company = companies.find(item => item.slug === slug || (name && item.name?.toLowerCase() === name))
      const title = text(row.jobTitle)

      if (company && title) {
         roles.set(company.slug, [...new Set([...(roles.get(company.slug) ?? []), title])])
      }
   }

   return roles
}

export const domainParams = (domains: string[], howMany: number) => ({
   domains,
   maxResults: howMany,
})

export const companiesFromDomains = (rows: Row[]): CompanyItem[] =>
   rows.flatMap(row => {
      const link = companyLinkOf(row.linkedinUrl)

      return link
         ? [
              {
                 kind: 'company' as const,
                 ...link,
                 name: text(row.domain),
                 hiring: [],
              },
           ]
         : []
   })
