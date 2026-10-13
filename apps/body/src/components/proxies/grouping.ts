import { type Account } from '../accounts/types'
import { type Proxy } from './types'

import { type HealthLevel } from './health'
import { type Readiness, readinessOf } from './readiness'

export type LevelFilter = HealthLevel | 'ALL'

// How urgently a level wants a person: the lower, the sooner it is shown.
const URGENCY: Record<HealthLevel, number> = {
   RISK: 0,
   WATCH: 1,
   ACCEPTED: 2,
   CHECKING: 3,
   HEALTHY: 4,
   PAUSED: 5,
}

export type AccountGroup = {
   account: Account
   // Every proxy of the account, whatever the filter: a card compares itself with these.
   all: Proxy[]
   // This account's proxies that match the filter: the one in use first, then the ones that need attention.
   proxies: Proxy[]
   // How many proxies the account has, whatever the filter.
   total: number
   readiness: Readiness
}

export const countByLevel = (proxies: Proxy[]): Record<HealthLevel, number> => {
   const counts: Record<HealthLevel, number> = {
      RISK: 0,
      WATCH: 0,
      ACCEPTED: 0,
      CHECKING: 0,
      HEALTHY: 0,
      PAUSED: 0,
   }

   for (const proxy of proxies) {
      counts[proxy.health.level] += 1
   }

   return counts
}

const accountUrgency = (group: AccountGroup) => {
   if (group.total === 0 || group.readiness.tone === 'danger') return 0
   if (group.readiness.tone === 'warning') return 1

   return Math.min(...group.proxies.map(proxy => URGENCY[proxy.health.level]), 4)
}

const byUrgency = (a: Proxy, b: Proxy) =>
   Number(b.isBest) - Number(a.isBest) ||
   URGENCY[a.health.level] - URGENCY[b.health.level] ||
   new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

// The page's sections: one per LinkedIn account, the ones that need a person first. With a filter, only the accounts
// that have a matching proxy, and only those proxies.
export const groupByAccount = (accounts: Account[], proxies: Proxy[], filter: LevelFilter): AccountGroup[] =>
   accounts
      .map(account => {
         const own = proxies.filter(proxy => proxy.linkedInAccountId === account.id)

         return {
            account,
            all: own,
            total: own.length,
            readiness: readinessOf(own),
            proxies: own.filter(proxy => filter === 'ALL' || proxy.health.level === filter).sort(byUrgency),
         }
      })
      .filter(group => (filter === 'ALL' ? true : group.proxies.length > 0))
      .sort((a, b) => accountUrgency(a) - accountUrgency(b))
