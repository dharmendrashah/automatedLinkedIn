import { describe, expect, it } from 'vitest'

import { type Account } from '../accounts/types'

import { countByLevel, groupByAccount } from './grouping'
import { makeProxy } from './testing'

const account = (id: string): Account =>
   ({
      id,
      email: `${id}@example.com`,
      status: 'ACTIVE',
   }) as Account

const level = (value: string, extra: Record<string, unknown> = {}) =>
   makeProxy({
      health: {
         level: value,
         issues: [],
         open: [],
      },
      ...extra,
   })

describe('countByLevel', () => {
   it('should count the proxies of each health level', () => {
      expect(countByLevel([level('HEALTHY'), level('HEALTHY'), level('RISK'), level('CHECKING')])).toEqual({
         HEALTHY: 2,
         WATCH: 0,
         RISK: 1,
         ACCEPTED: 0,
         CHECKING: 1,
         PAUSED: 0,
      })
   })
})

describe('groupByAccount', () => {
   it('should put the accounts that need a person first', () => {
      const proxies = [
         level('HEALTHY', { id: 'a', linkedInAccountId: 'ok' }),
         level('RISK', { id: 'b', linkedInAccountId: 'bad' }),
         level('WATCH', { id: 'c', linkedInAccountId: 'meh' }),
      ]
      const groups = groupByAccount([account('ok'), account('meh'), account('bad')], proxies, 'ALL')

      expect(groups.map(group => group.account.id)).toEqual(['bad', 'meh', 'ok'])
   })

   it('should rank an account with no proxy among the urgent ones, and keep it', () => {
      const groups = groupByAccount(
         [account('ok'), account('none')],
         [level('HEALTHY', { linkedInAccountId: 'ok' })],
         'ALL'
      )

      expect(groups.map(group => group.account.id)).toEqual(['none', 'ok'])
      expect(groups[0]).toMatchObject({
         total: 0,
         proxies: [],
      })
   })

   it('should list the proxy in use first, then the ones that need attention', () => {
      const proxies = [
         level('HEALTHY', { id: 'backup', isBest: false }),
         level('RISK', { id: 'risky', isBest: false }),
         level('WATCH', { id: 'inuse', isBest: true }),
      ]
      const [group] = groupByAccount([account('acc1')], proxies, 'ALL')

      expect(group.proxies.map(proxy => proxy.id)).toEqual(['inuse', 'risky', 'backup'])
   })

   it('should only keep the accounts and proxies that match a filter, and say how many proxies the account has', () => {
      const proxies = [
         level('RISK', { id: 'r', linkedInAccountId: 'bad' }),
         level('HEALTHY', { id: 'h', linkedInAccountId: 'bad', isBest: false }),
         level('HEALTHY', { id: 'h2', linkedInAccountId: 'ok' }),
      ]
      const groups = groupByAccount([account('ok'), account('bad'), account('none')], proxies, 'RISK')

      expect(groups).toHaveLength(1)
      expect(groups[0].proxies.map(proxy => proxy.id)).toEqual(['r'])
      expect(groups[0].total).toBe(2)
   })
})
