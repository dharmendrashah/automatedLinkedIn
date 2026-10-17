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

// Adds what the full profile showed and scores the person again; a profile that was not found keeps its first score.
export const applyProfiles = (
   people: PersonItem[],
   cards: Map<string, ProfileCard>,
   rules: ScoringRules,
   thresholds: Thresholds
) =>
   split(
      people.map(item => {
         const card = cards.get(item.slug)

         if (!card || item.band !== 'QUALIFIED') {
            return item
         }

         return rescore(
            {
               ...item,
               name: card.name ?? item.name,
               headline: card.headline ?? item.headline,
               location: card.location ?? item.location,
               followers: card.followers ?? item.followers,
               title: card.title,
               company: card.company,
               enriched: true,
            },
            rules,
            thresholds
         )
      })
   )
