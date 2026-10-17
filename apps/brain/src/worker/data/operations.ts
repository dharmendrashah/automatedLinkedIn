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

// Leaves out the settings that mean "any": the data service then applies no filter.
const sent = (params: Record<string, unknown>) =>
   Object.fromEntries(
      Object.entries(params).filter(
         ([, value]) =>
            value !== undefined &&
            value !== 'any' &&
            value !== '' &&
            value !== false &&
            !(Array.isArray(value) && value.length === 0)
      )
   )

export const commentersParams = (
   post: PostItem,
   config: { limit: number; postedWithin: string; includeReplies: boolean }
) =>
   sent({
      posts: post.url,
      maxResults: config.limit,
      postedLimit: config.postedWithin,
      includeReplies: config.includeReplies,
   })

export const reactorsParams = (post: PostItem, config: { limit: number; reactionType: string }) =>
   sent({
      posts: post.url,
      maxResults: config.limit,
      reactionTypeFilter: config.reactionType,
   })

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

export const findPostsParams = (config: {
   keywords: string
   postedWithin: string
   howMany: number
   sortBy?: string
   contentType?: string
   includeReposts?: boolean
   includeQuotePosts?: boolean
   authors?: string[]
   mentioning?: string[]
}) =>
   sent({
      queries: config.keywords,
      postedLimit: config.postedWithin,
      maxResults: config.howMany,
      sortBy: config.sortBy,
      contentType: config.contentType === 'all' ? undefined : config.contentType,
      includeReposts: config.includeReposts,
      includeQuotePosts: config.includeQuotePosts,
      authors: config.authors,
      mentioning: config.mentioning,
   })

type PostsOf = { howMany: number; postedWithin?: string; includeReposts?: boolean }

export const postsOfParams = (url: string, config: PostsOf) =>
   sent({
      urls: url,
      maxResults: config.howMany,
      postedLimit: config.postedWithin,
      includeReposts: config.includeReposts,
   })

export const engagedParams = (person: PersonItem, config: { howMany: number; postedWithin?: string }) =>
   sent({
      profiles: person.url,
      maxResults: config.howMany,
      postedLimit: config.postedWithin,
   })

type Employees = {
   howMany: number
   titles: string[]
   seniority: string[]
   functions?: string[]
   locations?: string[]
   pastTitles?: string[]
   yearsAtCompany?: string[]
   yearsOfExperience?: string[]
   headcount?: string[]
   changedJobs?: boolean
   industries?: string[]
}

export const employeesParams = (company: CompanyItem, config: Employees) =>
   sent({
      companies: company.url,
      maxResults: config.howMany,
      jobTitles: config.titles,
      seniorityLevels: config.seniority,
      functions: config.functions,
      locations: config.locations,
      pastJobTitles: config.pastTitles,
      yearsAtCompany: config.yearsAtCompany,
      yearsOfExperience: config.yearsOfExperience,
      companyHeadcount: config.headcount,
      recentlyChangedJobs: config.changedJobs,
      industries: config.industries,
   })

type SearchPeople = {
   keywords: string
   titles: string[]
   companies: string[]
   locations: string[]
   seniority: string[]
   functions: string[]
   headcount: string[]
   industries: string[]
   yearsOfExperience: string[]
   changedJobs: boolean
   postedRecently: boolean
   howMany: number
}

// A search reads whole pages of 25 people.
export const SEARCH_PAGE = 25

export const searchPeopleParams = (config: SearchPeople) =>
   sent({
      searchQuery: config.keywords,
      currentJobTitles: config.titles,
      currentCompanies: config.companies,
      locations: config.locations,
      seniorityLevel: config.seniority,
      function: config.functions,
      companyHeadcount: config.headcount,
      industry: config.industries,
      yearsOfExperience: config.yearsOfExperience,
      recentlyChangedJobs: config.changedJobs,
      recentlyPostedOnLinkedIn: config.postedRecently,
      maxProfiles: Math.ceil(config.howMany / SEARCH_PAGE) * SEARCH_PAGE,
   })

// People found by a search come with their full profile, so they are not read again.
export const searchedPeopleFrom = (rows: Row[]): PersonItem[] =>
   rows.flatMap(row => {
      const link = linkOf(row.profileUrl) ?? linkOf(`https://www.linkedin.com/in/${text(row.handle) ?? ''}`)

      return link
         ? [
              person({
                 ...link,
                 ...cardOf(row),
                 enriched: true,
              }),
           ]
         : []
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

type Jobs = {
   jobTitle: string
   howMany: number
   location?: string
   workplace?: string
   employment?: string
   experience?: string
   postedWithin?: string
   salary?: string
   sortBy?: string
   easyApply?: boolean
   fewApplicants?: boolean
   industries?: string[]
}

export const jobsParams = (companies: CompanyItem[], config: Jobs) =>
   sent({
      jobTitles: config.jobTitle,
      company: companies.map(({ name, slug }) => name ?? slug),
      maxResults: config.howMany,
      locations: config.location,
      workplaceType: config.workplace,
      employmentType: config.employment,
      experienceLevel: config.experience,
      postedLimit: config.postedWithin,
      salary: config.salary,
      sortBy: config.sortBy,
      easyApply: config.easyApply,
      under10Applicants: config.fewApplicants,
      industryIds: config.industries,
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
