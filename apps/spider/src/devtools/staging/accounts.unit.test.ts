import { describe, expect, it } from 'vitest'

import { type SavedAccount, type SavedProxy } from '../localDb'
import { RECENT_RUN_MS, type StagingAccount, buildAccounts, describeAccount, isLeaseHeld, refusalFor } from './accounts'

const sealed = {
   ciphertext: 'c',
   iv: 'i',
   tag: 't',
   key_version: 1,
}
const account = (id: string, email: string): SavedAccount => ({
   id,
   email,
   status: 'ACTIVE',
   secret: sealed,
})
const proxy = (id: string, accountId: string, status: string, host = `${id}.example`): SavedProxy => ({
   id,
   accountId,
   accountEmail: 'x',
   protocol: 'HTTP',
   host,
   port: 8000,
   status,
   secret: sealed,
})
const NOW = Date.parse('2026-10-26T12:00:00Z')

const only = (accounts: StagingAccount[]) => {
   const [found] = accounts

   if (!found) {
      throw new Error('no account')
   }

   return found
}

describe('buildAccounts', () => {
   it('gives each account its own proxy, preferring an active one', () => {
      const result = buildAccounts(
         [account('a1', 'one@x.com'), account('a2', 'two@x.com'), account('a3', 'three@x.com')],
         [proxy('p1', 'a1', 'UNREACHABLE'), proxy('p2', 'a1', 'ACTIVE'), proxy('p3', 'a2', 'DISABLED')],
         new Map([['a1', new Date('2026-10-26T11:00:00Z')]])
      )

      expect(result.map(found => [found.id, found.proxy?.id])).toEqual([
         ['a1', 'p2'],
         ['a2', 'p3'],
         ['a3', undefined],
      ])
      expect(result[0]?.lastActivity).toEqual(new Date('2026-10-26T11:00:00Z'))
      expect(result[1]?.lastActivity).toBeUndefined()
   })
})

describe('describeAccount', () => {
   it('shows the email, the proxy and how long ago it last ran', () => {
      const found = only(
         buildAccounts(
            [account('a1', 'one@x.com')],
            [proxy('p1', 'a1', 'ACTIVE', 'proxy.example')],
            new Map([['a1', new Date(NOW - 2 * 60 * 60 * 1000)]])
         )
      )

      expect(describeAccount(found, NOW)).toBe('one@x.com (ACTIVE) \u2014 proxy.example:8000 \u2014 last ran 2 h ago')
   })

   it('says so when there is no proxy and no run', () => {
      const found = only(buildAccounts([account('a1', 'one@x.com')], [], new Map()))

      expect(describeAccount(found, NOW)).toBe('one@x.com (ACTIVE) \u2014 no proxy \u2014 never ran')
   })
})

describe('isLeaseHeld', () => {
   it('is held until the lease expires', () => {
      expect(
         isLeaseHeld(
            JSON.stringify({
               task_id: 't',
               expires_at: '2026-10-26T12:05:00Z',
            }),
            NOW
         )
      ).toBe(true)
      expect(
         isLeaseHeld(
            JSON.stringify({
               task_id: 't',
               expires_at: '2026-10-26T11:59:00Z',
            }),
            NOW
         )
      ).toBe(false)
   })

   it('treats a lease nobody can read as expired, as the worker does', () => {
      expect(isLeaseHeld('not json', NOW)).toBe(false)
      expect(isLeaseHeld('{}', NOW)).toBe(false)
   })
})

describe('refusalFor', () => {
   it('refuses while the worker holds the account', () => {
      expect(
         refusalFor({
            leaseHeld: true,
            now: NOW,
         })
      ).toMatch(/worker holds this account/)
   })

   it('refuses when the account ran in the last 10 minutes and says how long to wait', () => {
      const message = refusalFor({
         leaseHeld: false,
         lastActivity: new Date(NOW - 4 * 60 * 1000),
         now: NOW,
      })

      expect(message).toMatch(/4 minutes ago/)
      expect(message).toMatch(/6 minutes/)
   })

   it('allows an account that is idle', () => {
      expect(
         refusalFor({
            leaseHeld: false,
            now: NOW,
         })
      ).toBeUndefined()
      expect(
         refusalFor({
            leaseHeld: false,
            lastActivity: new Date(NOW - RECENT_RUN_MS - 1000),
            now: NOW,
         })
      ).toBeUndefined()
   })
})
