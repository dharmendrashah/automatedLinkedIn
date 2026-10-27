import { describe, expect, it } from 'vitest'

import { type AccountRead, type NetworkRequest, type NetworkSnapshot } from './types'

import {
   blockedMessage,
   detailText,
   emptyView,
   holdText,
   isBusy,
   moreOnLinkedIn,
   readLine,
   skippedText,
   stateBadge,
   stateSentence,
   usageText,
   waitingCount,
} from './answer-state'

const NOW = new Date('2026-10-27T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const request = (overrides: Partial<NetworkRequest>): NetworkRequest => ({
   id: '1',
   accountId: 'one',
   slug: 'one',
   name: 'One',
   headline: '',
   state: 'WAITING',
   ...overrides,
})

const account = (overrides: Partial<AccountRead> = {}): AccountRead => ({
   accountId: 'one',
   total: 0,
   readAt: null,
   reading: false,
   answeredToday: 0,
   ...overrides,
})

const snapshot = (overrides: Partial<NetworkSnapshot>): NetworkSnapshot => ({
   requests: [],
   accounts: [account()],
   cut: false,
   ...overrides,
})

describe('stateSentence', () => {
   it('should say nothing for a request that waits for the owner', () => {
      expect(stateSentence(request({}), NOW)).toBeUndefined()
   })

   it('should say what a queued answer waits for, and how long ago it started', () => {
      expect(stateSentence(request({ state: 'QUEUED', action: 'ACCEPT', startedAt: ago(8000) }), NOW)).toBe(
         'Waiting for LinkedIn. Started 8 s ago.'
      )
      expect(stateSentence(request({ state: 'QUEUED', action: 'IGNORE', startedAt: ago(125_000) }), NOW)).toBe(
         'Waiting for LinkedIn. Started 2 min ago.'
      )
   })

   it('should say how an answer ended, in fixed sentences', () => {
      expect(stateSentence(request({ state: 'ACCEPTED', answeredAt: ago(5 * 60_000) }), NOW)).toBe(
         'Accepted 5 minutes ago.'
      )
      expect(stateSentence(request({ state: 'IGNORED', answeredAt: ago(1000) }), NOW)).toBe('Ignored just now.')
      expect(stateSentence(request({ state: 'GONE' }), NOW)).toContain('No longer on LinkedIn')
      expect(stateSentence(request({ state: 'UNSURE' }), NOW)).toContain('Not sure if LinkedIn took it')
      expect(stateSentence(request({ state: 'FAILED', failure: 'LinkedIn did not take the click.' }), NOW)).toBe(
         'LinkedIn did not take the click.'
      )
      expect(stateSentence(request({ state: 'FAILED' }), NOW)).toBe('This could not be done.')
   })
})

describe('stateBadge', () => {
   it('should wear no label while the request waits for the owner', () => {
      expect(stateBadge(request({}), NOW)).toBeUndefined()
   })

   it('should give each ending a short label and a tone', () => {
      expect(stateBadge(request({ state: 'QUEUED', action: 'IGNORE' }), NOW)).toEqual({
         label: 'Ignoring…',
         tone: 'busy',
      })
      expect(stateBadge(request({ state: 'ACCEPTED', answeredAt: ago(5 * 60_000) }), NOW)).toEqual({
         label: 'Accepted 5 minutes ago',
         tone: 'good',
      })
      expect(stateBadge(request({ state: 'IGNORED', answeredAt: ago(1000) }), NOW)).toEqual({
         label: 'Ignored just now',
         tone: 'muted',
      })
      expect(stateBadge(request({ state: 'GONE' }), NOW)?.tone).toBe('warn')
      expect(stateBadge(request({ state: 'UNSURE' }), NOW)?.label).toBe('Not sure')
      expect(stateBadge(request({ state: 'FAILED' }), NOW)).toEqual({
         label: 'Could not do it',
         tone: 'bad',
      })
   })
})

describe('detailText', () => {
   it('should explain what needs explaining, and leave a plain Accepted or Ignored to its label', () => {
      expect(detailText(request({ state: 'ACCEPTED', answeredAt: ago(1000) }), NOW)).toBeUndefined()
      expect(detailText(request({ state: 'IGNORED', answeredAt: ago(1000) }), NOW)).toBeUndefined()
      expect(detailText(request({ state: 'UNSURE' }), NOW)).toContain('Not sure if LinkedIn took it')
      expect(detailText(request({}), NOW)).toBeUndefined()
   })
})

describe('holdText', () => {
   it('should count the seconds left to undo, never below one', () => {
      expect(holdText({ action: 'ACCEPT', until: NOW.getTime() + 4200 }, NOW)).toBe('Accepting in 5 s')
      expect(holdText({ action: 'IGNORE', until: NOW.getTime() + 900 }, NOW)).toBe('Ignoring in 1 s')
      expect(holdText({ action: 'IGNORE', until: NOW.getTime() - 500 }, NOW)).toBe('Ignoring in 1 s')
   })
})

describe('isBusy', () => {
   it('should look again while a read or an answer is in progress, and not otherwise', () => {
      expect(isBusy(undefined)).toBe(false)
      expect(isBusy(snapshot({ accounts: [account(), account({ accountId: 'two', reading: true })] }))).toBe(true)
      expect(isBusy(snapshot({ requests: [request({ state: 'QUEUED' })] }))).toBe(true)
      expect(isBusy(snapshot({ requests: [request({}), request({ state: 'ACCEPTED' })] }))).toBe(false)
   })
})

describe('readLine', () => {
   it('should say when the list was last read, that it is being read, or that it never was', () => {
      expect(readLine([account({ reading: true, readAt: ago(1000) })], NOW)).toBe('Reading from LinkedIn…')
      expect(readLine([account({ readAt: ago(12 * 60_000) })], NOW)).toBe('Last read 12 minutes ago')
      expect(readLine([account()], NOW)).toBe('Nothing read yet')
   })

   it('should say how many accounts are being read, how many never were, and how old the oldest read is', () => {
      const old = account({ readAt: ago(3 * 60 * 60_000) })
      const fresh = account({ readAt: ago(60_000) })

      expect(readLine([old, account({ reading: true }), fresh], NOW)).toBe('Reading 1 of 3 accounts…')
      expect(readLine([old, account(), fresh], NOW)).toBe('1 of 3 accounts not read yet')
      expect(readLine([fresh, old], NOW)).toBe('Oldest read 3 hours ago')
      expect(readLine([], NOW)).toBe('')
   })
})

describe('usageText and waitingCount', () => {
   it('should say how much of the day is used, and count what waits including what is being answered', () => {
      expect(usageText(2)).toBe('2 of 50 answers used today')
      expect(
         waitingCount([request({}), request({ id: '2', state: 'QUEUED' }), request({ id: '3', state: 'IGNORED' })])
      ).toBe(2)
   })
})

describe('moreOnLinkedIn', () => {
   it('should say so only when LinkedIn counts more than was read, in all the accounts, or when brain cut the list', () => {
      const requests = [request({}), request({ id: '2' })]
      const counted = (...totals: number[]) => totals.map((total, index) => account({ accountId: `a${index}`, total }))

      expect(moreOnLinkedIn({ requests, accounts: counted(2), cut: false })).toBeUndefined()
      expect(moreOnLinkedIn({ requests, accounts: counted(8), cut: false })).toBe(
         'Showing 2 of the 8 requests on LinkedIn.'
      )
      expect(moreOnLinkedIn({ requests, accounts: counted(1, 4), cut: false })).toBe(
         'Showing 2 of the 5 requests on LinkedIn.'
      )
      expect(moreOnLinkedIn({ requests, accounts: counted(2), cut: true })).toBe(
         'Too many to show at once. Pick fewer accounts to see the rest.'
      )
   })
})

describe('blockedMessage and skippedText', () => {
   it('should say the sentence for one account, and how many for several', () => {
      expect(blockedMessage(['It is outside working hours.'])).toBe('It is outside working hours.')
      expect(blockedMessage(['Resting.', 'Outside hours.'])).toBe(
         '2 accounts may not browse now. The first says: Resting.'
      )
   })

   it('should say how many accounts a read left out and why, each sentence once', () => {
      expect(skippedText([])).toBe('')
      expect(skippedText([{ accountId: 'a', reason: 'Not signed in.', budget: false }])).toBe(
         '1 account was left out. Not signed in.'
      )
      expect(
         skippedText([
            { accountId: 'a', reason: 'Not signed in.', budget: false },
            { accountId: 'b', reason: 'Not signed in.', budget: false },
            { accountId: 'c', reason: 'Busy.', budget: false },
         ])
      ).toBe('3 accounts were left out. Not signed in. Busy.')
   })
})

describe('emptyView', () => {
   it('should say what is missing: a search with no match, a list never read, or an empty chip', () => {
      expect(emptyView('WAITING', true, true)).toMatchObject({ title: 'No match', read: false })
      expect(emptyView('WAITING', false, false)).toMatchObject({ title: 'Nothing read yet', read: true })
      expect(emptyView('WAITING', false, true)).toMatchObject({ title: 'You are all caught up', read: true })
      expect(emptyView('ACCEPTED', false, true).read).toBe(false)
      expect(emptyView('IGNORED', false, true).title).toBe('Nobody ignored yet')
      expect(emptyView('ATTENTION', false, true).title).toBe('Nothing needs a look')
   })
})
