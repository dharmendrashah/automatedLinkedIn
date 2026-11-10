import { type IcpRules, type IcpScore, scorePerson } from './icpScore'

export type ScoreFacts = {
   headline: string | null
   title: string | null
   location: string | null
   companyIndustry: string | null
   companySize: string | null
   // False until the profile was read; the industry and size only count after it.
   read: boolean
   signals: { type: string; excerpt: string | null }[]
}

type Engagement = { type: 'commented' | 'reacted'; excerpt: string | null }

const isEngagement = (signal: { type: string; excerpt: string | null }): signal is Engagement =>
   signal.type === 'commented' || signal.type === 'reacted'

// The rule score of one person against one ideal customer: the same rules a workflow's Score step uses.
export const personIcpScore = (rules: IcpRules & { problemKeywords: string[] }, facts: ScoreFacts): IcpScore =>
   scorePerson(rules, {
      headline: [facts.headline, facts.title].filter(Boolean).join(' · ') || null,
      location: facts.location,
      // The company only counts once the profile was read, as the Score step has it.
      companyIndustry: facts.read ? facts.companyIndustry : null,
      companySize: facts.read ? facts.companySize : null,
      read: facts.read,
      signals: facts.signals.filter(isEngagement),
   })
