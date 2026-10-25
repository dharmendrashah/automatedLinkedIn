import { type AccountBrowse } from './types'

import { limitSecondsOf } from './modes'

export type Bucket = 'FULL' | 'NEAR_FULL' | 'IDLE' | 'NOT_BROWSING' | 'OK'

export const NEAR_FULL_SHARE = 0.85
const IDLE_WORKING_DAYS = 3
const ATTENTION_DAYS = 3

export const shareOf = ({ usedSeconds, mode }: AccountBrowse) => usedSeconds / limitSecondsOf(mode)

// One place for each account, the most urgent first, so the overview counts add up to the number of accounts.
export const bucketOf = (account: AccountBrowse): Bucket => {
   if (account.state === 'NOT_BROWSING') {
      return 'NOT_BROWSING'
   }

   const share = shareOf(account)

   if (account.state === 'DAY_FULL' || share >= 1) {
      return 'FULL'
   }

   if (share >= NEAR_FULL_SHARE) {
      return 'NEAR_FULL'
   }

   return account.usedSeconds === 0 && account.idleWorkingDays >= IDLE_WORKING_DAYS ? 'IDLE' : 'OK'
}

export const countBuckets = (accounts: AccountBrowse[]) => {
   const counts: Record<Bucket, number> = {
      FULL: 0,
      NEAR_FULL: 0,
      IDLE: 0,
      NOT_BROWSING: 0,
      OK: 0,
   }

   accounts.forEach(account => {
      counts[bucketOf(account)] += 1
   })

   return counts
}

export const sortByUse = (accounts: AccountBrowse[]) => [...accounts].sort((a, b) => shareOf(b) - shareOf(a))

export const needAttention = (accounts: AccountBrowse[]) =>
   accounts.filter(({ overLimitDays14 }) => overLimitDays14 >= ATTENTION_DAYS)

export type ClientGroup = {
   label: string | null
   accounts: AccountBrowse[]
   usedSeconds: number
}

// Named clients in alphabetical order, accounts with no client last.
export const clientGroups = (accounts: AccountBrowse[]): ClientGroup[] => {
   const groups = new Map<string | null, AccountBrowse[]>()

   accounts.forEach(account => {
      groups.set(account.clientLabel, [...(groups.get(account.clientLabel) ?? []), account])
   })

   return [...groups.entries()]
      .map(([label, items]) => ({
         label,
         accounts: items,
         usedSeconds: items.reduce((sum, { usedSeconds }) => sum + usedSeconds, 0),
      }))
      .sort((a, b) => (a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label)))
}
