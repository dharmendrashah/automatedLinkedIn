import { describe, expect, it } from 'vitest'

import {
   type Form,
   type StepId,
   emptyForm,
   nextStep,
   parsePosts,
   progressOf,
   reconcile,
   stepProblems,
   suggestedPostsOf,
} from './steps'

const form = (patch: Partial<Form> = {}): Form => ({ ...emptyForm('Asia/Kolkata'), ...patch })

describe('nextStep and progressOf', () => {
   it('goes back to a reopened step, then on to the first one not done', () => {
      const done: StepId[] = ['name', 'kind', 'phrases', 'accounts']

      expect(nextStep(done)).toBe('customer')
      expect(nextStep(['name', 'kind', 'accounts'])).toBe('phrases')
   })

   it('counts a skipped step as done and reaches Review after the last question', () => {
      expect(progressOf(['name', 'kind'])).toMatchObject({ done: 2, current: 3, total: 12, percent: 17 })

      const all: StepId[] = [
         'name',
         'kind',
         'phrases',
         'customer',
         'accounts',
         'note',
         'message',
         'warmUp',
         'when',
         'handOff',
         'posts',
      ]

      expect(nextStep(all)).toBeNull()
      expect(progressOf(all)).toMatchObject({ done: 11, current: 12 })
   })
})

describe('kind', () => {
   it('is asked after the name and counts as answered only after choosing yes', () => {
      expect(nextStep(['name'])).toBe('kind')
      expect(stepProblems('kind', form(), 8)).toEqual(['Choose yes or no.'])
      expect(stepProblems('kind', form({ outreach: true }), 8)).toEqual([])
   })
})

describe('suggested posts', () => {
   it('follows the accounts that will send', () => {
      const ids = ['a', 'b', 'c', 'd']
      const every = suggestedPostsOf(form(), ids)
      const one = suggestedPostsOf(form({ accountMode: 'pick', accountIds: ['a'] }), ids)

      expect(every.used).toBe(4)
      expect(one.used).toBe(1)
      expect(every.suggested).toBeGreaterThan(one.suggested)
   })
})

describe('stepProblems', () => {
   it('shows only the problems of the step asked about', () => {
      expect(stepProblems('customer', form({ name: '' }), 8)).toEqual([
         'Add at least one job title, or pick a saved ideal customer.',
      ])
      expect(stepProblems('customer', form({ titles: ['CTO'] }), 8)).toEqual([])
   })

   it('refuses an empty time, an unknown time zone and a hand-off without https', () => {
      expect(stepProblems('when', form({ time: '' }), 8)).toEqual(['Write a time like 09:00.'])
      expect(stepProblems('when', form({ timeZone: 'Mars/Base' }), 8)).toEqual(['Use a time zone like Asia/Kolkata.'])
      expect(stepProblems('when', form({ timeZone: 'UTC' }), 8)).toEqual([])
      expect(stepProblems('handOff', form({ handOffUrl: 'http://x.test' }), 8)).toEqual([
         'The address must start with https://.',
      ])
      expect(stepProblems('handOff', form(), 8)).toEqual([])
   })

   it('asks for comment texts when comments are on', () => {
      expect(stepProblems('warmUp', form({ comments: 'texts' }), 8)).toEqual([
         'Write at least one comment text, or turn comments off.',
      ])
   })

   it('asks for an account when the pick is empty', () => {
      expect(stepProblems('accounts', form({ accountMode: 'pick' }), 8)).toEqual(['Pick at least one account.'])
   })
})

describe('parsePosts', () => {
   it('does not turn an empty field into 0', () => {
      expect(parsePosts('')).toBeNull()
      expect(parsePosts(' ')).toBeNull()
      expect(parsePosts('2.5')).toBeNull()
      expect(parsePosts('7')).toBe(7)
      expect(stepProblems('posts', form({ postsPerDay: 0 }), 8)).toHaveLength(1)
   })
})

describe('reconcile', () => {
   it('drops an account or ideal customer that no longer exists', () => {
      const stale = form({ accountMode: 'pick', accountIds: ['a', 'gone'], icpId: 'old' })

      expect(reconcile(stale, { accountIds: ['a'], icpIds: [] })).toMatchObject({ accountIds: ['a'], icpId: '' })
   })

   it('keeps everything while a list has not loaded', () => {
      const stale = form({ accountIds: ['a'], icpId: 'old' })

      expect(reconcile(stale, { accountIds: null, icpIds: null })).toBe(stale)
   })
})
