import { describe, expect, it } from 'vitest'

import { type AccountBrowse } from '../browsing/types'

import { type ItemState } from './today'
import {
   type AccountLike,
   TOOLS_FROM,
   clientsOf,
   countChips,
   filterRows,
   groupRows,
   isChip,
   rowsOf,
   showTools,
   sortRows,
   summaryOf,
} from './toolbar'

const hours = {
   days: [1, 2, 3, 4, 5],
   startMinute: 540,
   endMinute: 1080,
   timeZone: 'UTC',
}

const account = (id: string, patch: Partial<AccountLike> = {}): AccountLike => ({
   id,
   email: `${id}@example.com`,
   displayName: null,
   status: 'ACTIVE',
   statusMessage: null,
   lastVerifiedAt: '2026-10-26T10:00:00Z',
   nextBrowseAt: null,
   ...patch,
})

const browse = (id: string, patch: Partial<AccountBrowse> = {}): AccountBrowse => ({
   accountId: id,
   email: `${id}@example.com`,
   clientLabel: null,
   mode: 'SAFE',
   usedSeconds: 20 * 60,
   state: 'OPEN',
   nextAt: null,
   hours,
   proxyTimeZone: 'UTC',
   last30: [],
   idleWorkingDays: 0,
   overLimitDays14: 0,
   viewsLeft: 5,
   ...patch,
})

const accounts = [
   account('error', { status: 'ERROR' }),
   account('full'),
   account('near'),
   account('idle'),
   account('paused', { status: 'DISABLED' }),
   account('ready'),
]
const byId = new Map([
   ['error', browse('error', { state: 'NOT_BROWSING', clientLabel: 'Acme' })],
   ['full', browse('full', { state: 'DAY_FULL', usedSeconds: 90 * 60, clientLabel: 'Acme' })],
   ['near', browse('near', { usedSeconds: 80 * 60 })],
   ['idle', browse('idle', { usedSeconds: 0, idleWorkingDays: 4, clientLabel: 'Zed' })],
   ['paused', browse('paused', { state: 'NOT_BROWSING', usedSeconds: 0 })],
   ['ready', browse('ready')],
])
const rows = rowsOf(accounts, byId)
const ids = (list: typeof rows) => list.map(({ account: { id } }) => id)

describe('showTools', () => {
   it('should hide the tools until there are enough accounts to need them', () => {
      expect(showTools(TOOLS_FROM - 1)).toBe(false)
      expect(showTools(TOOLS_FROM)).toBe(true)
   })
})

describe('isChip', () => {
   it('should accept only a chip it knows', () => {
      expect(isChip('needs')).toBe(true)
      expect(isChip('whatever')).toBe(false)
      expect(isChip(null)).toBe(false)
   })
})

describe('countChips and filterRows', () => {
   it('should count each chip and list the accounts of a chip', () => {
      expect(countChips(rows)).toEqual({
         all: 6,
         needs: 1,
         ready: 3,
         failed: 0,
         pending: 0,
         due: 0,
         full: 1,
         near: 1,
         idle: 1,
         'not-browsing': 2,
         paused: 1,
      })
      expect(ids(filterRows(rows, { q: '', client: '', chip: 'needs' }))).toEqual(['error'])
      expect(ids(filterRows(rows, { q: '', client: '', chip: 'paused' }))).toEqual(['paused'])
   })

   it('should narrow by client and by words, together', () => {
      expect(ids(filterRows(rows, { q: '', client: 'Acme', chip: 'all' }))).toEqual(['error', 'full'])
      expect(ids(filterRows(rows, { q: ' ZED ', client: '', chip: 'all' }))).toEqual(['idle'])
      expect(ids(filterRows(rows, { q: 'full', client: 'Acme', chip: 'all' }))).toEqual(['full'])
      expect(ids(filterRows(rows, { q: 'nothing', client: '', chip: 'all' }))).toEqual([])
   })

   it('should match no browsing chip when there is no browsing data', () => {
      const bare = rowsOf(accounts, undefined)

      expect(countChips(bare)).toMatchObject({ full: 0, near: 0, idle: 0, 'not-browsing': 0, needs: 1, paused: 1 })
   })

   it('should filter by the state of the daily items: failed, pending today and due now', () => {
      const state = (kind: ItemState['kind']): ItemState[] => [
         {
            item: 'visit',
            kind,
            tone: 'muted',
            text: 'Visit',
            detail: '',
            last: null,
            result: null,
            resultTone: null,
            runId: null,
            lastOkText: null,
            lastOkId: null,
            next: '',
            at: null,
         },
      ]
      const withStates = rowsOf(
         accounts,
         byId,
         new Map([
            ['full', state('FAILED')],
            ['near', state('PENDING')],
            ['idle', state('WAITING')],
            ['ready', state('DONE')],
         ])
      )

      expect(ids(filterRows(withStates, { q: '', client: '', chip: 'failed' }))).toEqual(['full'])
      expect(ids(filterRows(withStates, { q: '', client: '', chip: 'pending' }))).toEqual(['near'])
      expect(ids(filterRows(withStates, { q: '', client: '', chip: 'due' }))).toEqual(['idle'])
      expect(countChips(withStates)).toMatchObject({ failed: 1, pending: 1, due: 1 })
   })
})

describe('sortRows and clientsOf', () => {
   it('should list the accounts that need you first, paused last, then by email', () => {
      expect(ids(sortRows(rows))).toEqual(['error', 'full', 'near', 'idle', 'ready', 'paused'])
      expect(clientsOf(rows)).toEqual(['Acme', 'Zed'])
   })
})

describe('groupRows', () => {
   it('should group by client, the groups that need you first and accounts with no client last', () => {
      const groups = groupRows(sortRows(rows))

      expect(groups.map(({ label }) => label)).toEqual(['Acme', 'Zed', null])
      expect(groups[0]).toMatchObject({ needs: 1, usedSeconds: 110 * 60 })
      expect(ids(groups[2]?.rows ?? [])).toEqual(['near', 'ready', 'paused'])
   })

   it('should put a group that needs you first even when it has no client', () => {
      const calm = rowsOf(
         [account('a'), account('b', { status: 'ERROR' })],
         new Map([['a', browse('a', { clientLabel: 'Calm' })]])
      )

      expect(groupRows(calm).map(({ label }) => label)).toEqual([null, 'Calm'])
   })
})

describe('summaryOf', () => {
   it('should say nothing without accounts', () => {
      expect(summaryOf([], null)).toBeNull()
   })

   it('should name how many need you and why, with the worst one to fix', () => {
      const summary = summaryOf(rows, null)

      expect(summary).toMatchObject({ tone: 'attention', fix: 'error' })
      expect(summary?.text).toBe(
         '1 of 6 accounts need you. error@example.com: Sign-in check failed. Visits are on hold.'
      )
   })

   it('should say the next step for one account whose sign-in was never checked', () => {
      const first = rowsOf([account('new', { status: 'PENDING', lastVerifiedAt: null })], undefined)

      expect(summaryOf(first, null)).toEqual({
         tone: 'first',
         text: 'Next step: press Test login on new@example.com.',
         fix: 'new',
         progress: null,
      })
   })

   it('should name a failed check when nothing else needs you', () => {
      const failed: ItemState = {
         item: 'login',
         kind: 'FAILED',
         tone: 'bad',
         text: 'Login failed 09:12',
         detail: '',
         last: null,
         result: null,
         resultTone: null,
         runId: null,
         lastOkText: null,
         lastOkId: null,
         next: '',
         at: null,
      }
      const list = rowsOf([account('a'), account('b')], undefined, new Map([['b', [failed]]]))

      expect(summaryOf(list, '1 of 8 checks done today.')).toEqual({
         tone: 'attention',
         text: '1 account has a failed check. b@example.com: Login failed 09:12.',
         fix: 'b',
         progress: null,
      })
   })

   it('should say all is fine with the day so far', () => {
      const fine = rowsOf([account('a'), account('b'), account('c')], undefined)

      expect(summaryOf(fine, '7 of 12 checks done today. Next: messages 14:00.')).toEqual({
         tone: 'fine',
         text: 'All 3 accounts are fine.',
         fix: null,
         progress: '7 of 12 checks done today. Next: messages 14:00.',
      })
      expect(summaryOf(fine.slice(0, 1), null)?.text).toBe('The account is fine.')
   })
})
