import { describe, expect, it } from 'vitest'

import {
   QUIET_DAYS,
   clientLabels,
   defaultTab,
   filterRows,
   isTab,
   knownScope,
   parseScope,
   quietAccounts,
   readyAccounts,
   scopeValue,
   tabOfState,
} from './landing'

const labels = new Map<string, string | null>([
   ['a1', 'Acme'],
   ['a2', 'Acme'],
   ['a3', null],
])

const rows = [
   { accountId: 'a1', text: 'Hiring a designer' },
   { accountId: 'a2', text: 'Our new pricing' },
   { accountId: 'a3', text: 'Pricing for founders' },
]
const of = (row: (typeof rows)[number]) => row

describe('tabOfState', () => {
   it('should put each state under the tab the owner looks for it in', () => {
      expect(['SCHEDULED', 'QUEUED', 'SENDING'].map(state => tabOfState(state as never))).toEqual([
         'planned',
         'planned',
         'planned',
      ])
      expect(tabOfState('POSTED')).toBe('posted')
      expect(tabOfState('FAILED')).toBe('failed')
      expect(tabOfState('UNKNOWN')).toBe('failed')
   })
})

describe('defaultTab and isTab', () => {
   it('should open on what needs the owner first and on drafts when everything is empty', () => {
      expect(defaultTab({ failed: 1, drafts: 3, planned: 2, posted: 9 })).toBe('failed')
      expect(defaultTab({ failed: 0, drafts: 3, planned: 2, posted: 9 })).toBe('drafts')
      expect(defaultTab({ failed: 0, drafts: 0, planned: 0, posted: 9 })).toBe('posted')
      expect(defaultTab({ failed: 0, drafts: 0, planned: 0, posted: 0 })).toBe('drafts')
   })

   it('should accept only a known tab from the address', () => {
      expect(isTab('planned')).toBe(true)
      expect(isTab('nope')).toBe(false)
      expect(isTab(null)).toBe(false)
   })
})

describe('parseScope', () => {
   it('should read back what scopeValue wrote, and treat anything else as every account', () => {
      for (const scope of [
         { kind: 'all' },
         { kind: 'client', label: 'Acme: EU' },
         { kind: 'account', id: 'a1' },
      ] as const) {
         expect(parseScope(scopeValue(scope))).toEqual(scope)
      }

      expect(parseScope(null)).toEqual({ kind: 'all' })
      expect(parseScope('account:')).toEqual({ kind: 'all' })
      expect(parseScope('client:')).toEqual({ kind: 'all' })
      expect(parseScope('whatever')).toEqual({ kind: 'all' })
   })
})

describe('filterRows', () => {
   it('should keep the rows of one account or of every account of a client', () => {
      expect(filterRows(rows, of, { scope: { kind: 'account', id: 'a3' }, search: '', labels })).toEqual([rows[2]])
      expect(filterRows(rows, of, { scope: { kind: 'client', label: 'Acme' }, search: '', labels })).toEqual([
         rows[0],
         rows[1],
      ])
      expect(filterRows(rows, of, { scope: { kind: 'all' }, search: '', labels })).toEqual(rows)
   })

   it('should match the words without caring about case or the spaces around them, together with the scope', () => {
      expect(filterRows(rows, of, { scope: { kind: 'all' }, search: '  PRICING ', labels })).toEqual([rows[1], rows[2]])
      expect(filterRows(rows, of, { scope: { kind: 'client', label: 'Acme' }, search: 'pricing', labels })).toEqual([
         rows[1],
      ])
      expect(filterRows(rows, of, { scope: { kind: 'all' }, search: 'nothing like it', labels })).toEqual([])
   })
})

describe('knownScope', () => {
   it('should keep an account or client the owner has and fall back to every account for one that is gone', () => {
      const accounts = [{ id: 'a1' }]

      expect(knownScope({ kind: 'account', id: 'a1' }, accounts, labels)).toEqual({ kind: 'account', id: 'a1' })
      expect(knownScope({ kind: 'account', id: 'zz' }, accounts, labels)).toEqual({ kind: 'all' })
      expect(knownScope({ kind: 'client', label: 'Acme' }, accounts, labels)).toEqual({ kind: 'client', label: 'Acme' })
      expect(knownScope({ kind: 'client', label: 'Gone' }, accounts, labels)).toEqual({ kind: 'all' })
   })
})

describe('clientLabels', () => {
   it('should list each client once, sorted, and skip accounts without one', () => {
      expect(
         clientLabels(
            new Map([
               ['a', 'Zed'],
               ['b', 'Acme'],
               ['c', 'Acme'],
               ['d', null],
               ['e', ''],
            ])
         )
      ).toEqual(['Acme', 'Zed'])
   })
})

describe('readyAccounts', () => {
   it('should keep only the accounts that can post', () => {
      const accounts = [
         { id: 'a', status: 'ACTIVE' },
         { id: 'b', status: 'ERROR' },
         { id: 'c', status: 'DISABLED' },
      ]

      expect(readyAccounts(accounts).map(({ id }) => id)).toEqual(['a'])
   })
})

describe('quietAccounts', () => {
   const now = Date.parse('2026-10-28T12:00:00Z')
   const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
   const accounts = [
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'ACTIVE' },
      { id: 'c', status: 'ERROR' },
   ]

   it('should flag a ready account whose last post is older than the quiet days or who never posted', () => {
      const posts = [
         { accountId: 'a', state: 'POSTED' as const, postedAt: daysAgo(QUIET_DAYS + 2) },
         { accountId: 'a', state: 'FAILED' as const, postedAt: null },
      ]

      expect(quietAccounts(accounts, posts, now).map(({ id }) => id)).toEqual(['a', 'b'])
   })

   it('should not flag an account with a recent post or a post planned or on its way, nor one that cannot post', () => {
      const posts = [
         { accountId: 'a', state: 'POSTED' as const, postedAt: daysAgo(1) },
         { accountId: 'b', state: 'SCHEDULED' as const, postedAt: null },
      ]

      expect(quietAccounts(accounts, posts, now)).toEqual([])
   })
})
