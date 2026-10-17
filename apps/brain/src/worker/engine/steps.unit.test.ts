import { describe, expect, it, vi } from 'vitest'

import { person } from 'core'

import { applyProfiles, conditionsOf, filterPeople, matches, scorePeople } from './steps'

// core's index also loads services that read env; these pure steps need none of it.
vi.mock('env', () => ({}))

const rules = {
   includeTitles: ['growth'],
   excludeTitles: ['intern'],
   seniorities: ['VP' as const],
   locations: ['london'],
   problemKeywords: ['pipeline'],
}

const thresholds = {
   qualifyScore: 60,
   maybeScore: 40,
   maybeEnabled: true,
}

const commented = (excerpt: string) => ({
   type: 'commented' as const,
   via: 'post',
   at: null,
   excerpt,
})

const ada = person({
   slug: 'ada',
   url: 'u',
   headline: 'VP Growth',
   followers: 500,
   signals: [commented('our pipeline is thin')],
})
const bob = person({
   slug: 'bob',
   url: 'u',
   headline: 'Growth intern',
   signals: [commented('nice')],
})
const cy = person({
   slug: 'cy',
   url: 'u',
   headline: 'Growth marketer',
   signals: [commented('nice')],
})

describe('engine steps', () => {
   it('should match If conditions with all or any, and let everyone through when none is set', () => {
      const slugs = (config: Record<string, unknown>) =>
         [ada, bob, cy].filter(item => matches(item, conditionsOf(config))).map(({ slug }) => slug)

      expect(slugs({})).toEqual(['ada', 'bob', 'cy'])
      expect(
         slugs({
            minFollowers: 100,
            headlineHas: ['marketer'],
         })
      ).toEqual([])
      expect(
         slugs({
            match: 'any',
            minFollowers: 100,
            headlineHas: ['marketer'],
         })
      ).toEqual(['ada', 'cy'])
      expect(slugs({ signal: 'reacted' })).toEqual([])
   })
   it('should filter on followers, comment-only and headline words', () => {
      expect(
         filterPeople([ada, bob, cy], {
            minFollowers: 100,
            signal: 'commented',
            headlineWords: [],
         }).map(({ slug }) => slug)
      ).toEqual(['ada'])
      expect(
         filterPeople([ada, bob, cy], {
            minFollowers: 0,
            signal: 'any',
            headlineWords: ['marketer'],
         }).map(({ slug }) => slug)
      ).toEqual(['cy'])
   })

   it('should band people at 60 and 40 and count the rest as discarded', () => {
      const { kept, discarded } = scorePeople([ada, bob, cy], rules, thresholds)

      expect(kept.map(({ slug, band, score }) => [slug, band, score])).toEqual([
         ['ada', 'QUALIFIED', 70],
         ['cy', 'MAYBE', 40],
      ])
      expect(discarded).toBe(1)
      expect(
         scorePeople([cy], rules, {
            ...thresholds,
            maybeEnabled: false,
         }).discarded
      ).toBe(1)
   })

   it('should rescore people with their full profile, and only add what it shows when there is no scoring', () => {
      const { kept } = scorePeople([ada, cy], rules, thresholds)
      const cards = new Map([
         [
            'ada',
            {
               name: 'Ada L',
               headline: 'Student',
               location: 'Paris',
               followers: 10,
               title: 'Intern',
               company: 'Acme',
            },
         ],
      ])

      const scored = applyProfiles(kept, cards, rules, thresholds)
      const unscored = applyProfiles([ada], cards, null, thresholds)

      expect(scored.find(({ slug }) => slug === 'ada')?.band).toBeNull()
      expect(scored.find(({ slug }) => slug === 'cy')?.band).not.toBeNull()
      expect(unscored[0]).toMatchObject({
         name: 'Ada L',
         company: 'Acme',
         enriched: true,
         band: ada.band,
      })
   })
})
