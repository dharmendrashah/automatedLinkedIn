import { type Band, type IcpRules, type PersonItem, scorePerson } from 'core'

// The steps that need no data service: pure functions over the people a step received.

export type Thresholds = {
   qualifyScore: number
   maybeScore: number
   maybeEnabled: boolean
}

export type ScoringRules = IcpRules & { problemKeywords: string[] }

export type FilterConfig = {
   minFollowers: number
   signal: 'any' | 'commented'
   headlineWords: string[]
}

const hasWord = (headline: string | null, words: string[]) => {
   const text = headline?.toLowerCase() ?? ''

   return words.some(word => text.includes(word))
}

export const filterPeople = (people: PersonItem[], config: FilterConfig) =>
   people.filter(
      item =>
         (config.minFollowers === 0 || (item.followers ?? 0) >= config.minFollowers) &&
         (config.signal === 'any' || item.signals.some(({ type }) => type === 'commented')) &&
         (config.headlineWords.length === 0 || hasWord(item.headline, config.headlineWords))
   )

// The If block's conditions; a condition left at 0, "any" or empty is not checked.
export type Conditions = {
   match: 'all' | 'any'
   minScore: number
   minFollowers: number
   signal: 'any' | 'commented' | 'reacted'
   headlineHas: string[]
   locationHas: string[]
   companyHas: string[]
   hasLabel: string[]
}

const numberAt = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return typeof value === 'number' ? value : 0
}

const wordsAt = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return Array.isArray(value) ? value.map(String) : []
}

export const conditionsOf = (config: Record<string, unknown>): Conditions => ({
   match: config.match === 'any' ? 'any' : 'all',
   minScore: numberAt(config, 'minScore'),
   minFollowers: numberAt(config, 'minFollowers'),
   signal: config.signal === 'commented' || config.signal === 'reacted' ? config.signal : 'any',
   headlineHas: wordsAt(config, 'headlineHas'),
   locationHas: wordsAt(config, 'locationHas'),
   companyHas: wordsAt(config, 'companyHas'),
   hasLabel: wordsAt(config, 'hasLabel'),
})

// True when the person meets all (or any) of the conditions set; with none set everyone matches.
export const matches = (item: PersonItem, conditions: Conditions) => {
   const checks = [
      conditions.minScore > 0 ? (item.score ?? 0) >= conditions.minScore : null,
      conditions.minFollowers > 0 ? (item.followers ?? 0) >= conditions.minFollowers : null,
      conditions.signal === 'any' ? null : item.signals.some(({ type }) => type === conditions.signal),
      conditions.headlineHas.length > 0
         ? hasWord([item.headline, item.title].filter(Boolean).join(' '), conditions.headlineHas)
         : null,
      conditions.locationHas.length > 0 ? hasWord(item.location, conditions.locationHas) : null,
      conditions.companyHas.length > 0 ? hasWord(item.company, conditions.companyHas) : null,
      conditions.hasLabel.length > 0 ? item.tags.some(tag => conditions.hasLabel.includes(tag)) : null,
   ].filter((check): check is boolean => check !== null)

   if (checks.length === 0) {
      return true
   }

   return conditions.match === 'all' ? checks.every(Boolean) : checks.some(Boolean)
}

export const bandOf = (score: number, thresholds: Thresholds): Band | null => {
   if (score >= thresholds.qualifyScore) {
      return 'QUALIFIED'
   }

   return thresholds.maybeEnabled && score >= thresholds.maybeScore ? 'MAYBE' : null
}

const rescore = (item: PersonItem, rules: ScoringRules, thresholds: Thresholds): PersonItem => {
   const headline = [item.headline, item.title].filter(Boolean).join(' · ') || null
   const { score, disqualified, matched } = scorePerson(rules, {
      headline,
      location: item.location,
      signals: item.signals,
   })

   return {
      ...item,
      score,
      matched,
      band: disqualified ? null : bandOf(score, thresholds),
   }
}

const split = (people: PersonItem[]) => ({
   kept: people.filter(({ band }) => band !== null),
   discarded: people.filter(({ band }) => band === null).length,
})

// Scores everyone and keeps the qualified and maybe people; the rest is only counted.
export const scorePeople = (people: PersonItem[], rules: ScoringRules, thresholds: Thresholds) =>
   split(people.map(item => rescore(item, rules, thresholds)))

export type ProfileCard = {
   name: string | null
   headline: string | null
   location: string | null
   followers: number | null
   title: string | null
   company: string | null
}

// Adds what the full profile showed and, when scoring is on, scores the person again. A profile that was not found
// keeps what it had.
export const applyProfiles = (
   people: PersonItem[],
   cards: Map<string, ProfileCard>,
   rules: ScoringRules | null,
   thresholds: Thresholds
): PersonItem[] =>
   people.map(item => {
      const card = cards.get(item.slug)

      if (!card) {
         return item
      }

      const read = {
         ...item,
         name: card.name ?? item.name,
         headline: card.headline ?? item.headline,
         location: card.location ?? item.location,
         followers: card.followers ?? item.followers,
         title: card.title,
         company: card.company,
         enriched: true,
      }

      return rules ? rescore(read, rules, thresholds) : read
   })
