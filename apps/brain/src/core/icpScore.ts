// Rules-only scoring of a person against an ideal customer. Only what a headline and a location can prove is
// scored here; industry, company size and engagement are added when a workflow reads more about the person.

export const SENIORITIES = ['OWNER', 'CXO', 'VP', 'HEAD', 'DIRECTOR', 'MANAGER'] as const

export type Seniority = (typeof SENIORITIES)[number]

const SENIORITY_KEYWORDS: Record<Seniority, readonly string[]> = {
   OWNER: ['founder', 'co-founder', 'cofounder', 'owner'],
   CXO: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'chief'],
   VP: ['vp', 'vice president'],
   HEAD: ['head'],
   DIRECTOR: ['director'],
   MANAGER: ['manager'],
}

const isSeniority = (value: string): value is Seniority => SENIORITIES.some(level => level === value)

// Stored levels are plain strings; unknown ones are ignored.
export const readSeniorities = (values: string[]) => values.filter(isSeniority)

export const ICP_WEIGHTS = {
   title: 30,
   seniority: 20,
   location: 5,
} as const

export type IcpRules = {
   includeTitles: string[]
   excludeTitles: string[]
   seniorities: Seniority[]
   locations: string[]
}

export type IcpSample = {
   headline: string | null
   location: string | null
}

export type IcpScore = {
   score: number
   disqualified: boolean
   matched: string[]
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A phrase counts only as whole words, so "growth" does not match "growthhacker".
const contains = (text: string, phrase: string) =>
   new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase.toLowerCase())}(?![\\p{L}\\p{N}])`, 'u').test(text)

const firstIn = (text: string, phrases: readonly string[]) => phrases.find(phrase => contains(text, phrase))

export const scoreIcp = (rules: IcpRules, sample: IcpSample): IcpScore => {
   const headline = sample.headline?.toLowerCase() ?? ''
   const location = sample.location?.toLowerCase() ?? ''

   const excluded = firstIn(headline, rules.excludeTitles)

   if (excluded) {
      return {
         score: 0,
         disqualified: true,
         matched: [`excluded title "${excluded}"`],
      }
   }

   const title = firstIn(headline, rules.includeTitles)
   const seniority = rules.seniorities.find(level => firstIn(headline, SENIORITY_KEYWORDS[level]))
   const place = firstIn(location, rules.locations)

   const hits: { weight: number; label: string }[] = []

   if (title) {
      hits.push({
         weight: ICP_WEIGHTS.title,
         label: `title "${title}"`,
      })
   }

   if (seniority) {
      hits.push({
         weight: ICP_WEIGHTS.seniority,
         label: `seniority ${seniority}`,
      })
   }

   if (place) {
      hits.push({
         weight: ICP_WEIGHTS.location,
         label: `location "${place}"`,
      })
   }

   return {
      score: hits.reduce((sum, hit) => sum + hit.weight, 0),
      disqualified: false,
      matched: hits.map(hit => hit.label),
   }
}
