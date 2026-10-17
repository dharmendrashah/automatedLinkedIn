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

export const SIGNAL_WEIGHTS = {
   problemComment: 20,
   comment: 10,
   hiring: 10,
   reaction: 5,
} as const

type ScoredSignal = { type: 'commented' | 'reacted' | 'employee' | 'hiring'; excerpt: string | null }

// Engagement adds to the headline score: a comment that names the problem counts most, a reaction least; working at a
// company that is hiring counts like a comment, and simply working at a target company adds nothing. Signals add up.
export const scoreSignals = (problemKeywords: string[], signals: ScoredSignal[]) => {
   const matched: string[] = []
   let score = 0

   for (const signal of signals) {
      const problem =
         signal.type === 'commented' ? firstIn(signal.excerpt?.toLowerCase() ?? '', problemKeywords) : undefined

      if (problem) {
         score += SIGNAL_WEIGHTS.problemComment
         matched.push(`comment mentions "${problem}"`)
      } else if (signal.type === 'commented') {
         score += SIGNAL_WEIGHTS.comment
         matched.push('commented')
      } else if (signal.type === 'hiring') {
         score += SIGNAL_WEIGHTS.hiring
         matched.push('company is hiring')
      } else if (signal.type === 'reacted') {
         score += SIGNAL_WEIGHTS.reaction
         matched.push('reacted')
      }
   }

   return {
      score,
      matched,
   }
}

export const MAX_SCORE = 100

// The whole score of a person a workflow found: the headline rules plus engagement, at most 100.
export const scorePerson = (
   rules: IcpRules & { problemKeywords: string[] },
   sample: IcpSample & { signals: ScoredSignal[] }
): IcpScore => {
   const base = scoreIcp(rules, sample)

   if (base.disqualified) {
      return base
   }

   const engagement = scoreSignals(rules.problemKeywords, sample.signals)

   return {
      score: Math.min(MAX_SCORE, base.score + engagement.score),
      disqualified: false,
      matched: [...base.matched, ...engagement.matched],
   }
}
