import { type SavedAccount, type SavedProxy } from '../localDb'

// A second browser on the session can make LinkedIn cancel it, so an account that ran this recently is left alone.
export const RECENT_RUN_MS = 10 * 60 * 1000

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export type StagingAccount = SavedAccount & {
   proxy?: SavedProxy
   lastActivity?: Date
}

// Active proxies first; the rows arrive oldest first, so the account's first proxy wins among equals.
const bestProxy = (proxies: SavedProxy[]) => proxies.find(found => found.status === 'ACTIVE') ?? proxies[0]

export const buildAccounts = (
   accounts: SavedAccount[],
   proxies: SavedProxy[],
   lastActivity: Map<string, Date>
): StagingAccount[] =>
   accounts.map(account => {
      const proxy = bestProxy(proxies.filter(found => found.accountId === account.id))
      const last = lastActivity.get(account.id)

      return {
         ...account,
         ...(proxy && { proxy }),
         ...(last && { lastActivity: last }),
      }
   })

const ago = (since: Date, now: number) => {
   const elapsed = Math.max(0, now - since.getTime())

   if (elapsed < HOUR_MS) {
      return `${Math.floor(elapsed / MINUTE_MS)} min ago`
   }

   return elapsed < DAY_MS ? `${Math.floor(elapsed / HOUR_MS)} h ago` : `${Math.floor(elapsed / DAY_MS)} d ago`
}

export const describeAccount = ({ email, status, proxy, lastActivity }: StagingAccount, now: number) =>
   [
      `${email} (${status})`,
      proxy ? `${proxy.host}:${proxy.port}` : 'no proxy',
      lastActivity ? `last ran ${ago(lastActivity, now)}` : 'never ran',
   ].join(' \u2014 ')

// The worker's rule: a lease nobody can read counts as expired.
export const isLeaseHeld = (body: string, now: number) => {
   try {
      const { expires_at: expiresAt } = JSON.parse(body) as { expires_at?: unknown }

      return typeof expiresAt === 'string' && Date.parse(expiresAt) > now
   } catch {
      return false
   }
}

type Check = {
   leaseHeld: boolean
   lastActivity?: Date
   now: number
}

// Why this account must not be opened from this computer right now, or nothing when it may.
export const refusalFor = ({ leaseHeld, lastActivity, now }: Check) => {
   if (leaseHeld) {
      return 'The staging worker holds this account right now (a task is running). Try again when it has finished.'
   }

   const elapsed = lastActivity ? now - lastActivity.getTime() : Number.POSITIVE_INFINITY

   if (elapsed < RECENT_RUN_MS) {
      return `It ran on staging ${Math.floor(elapsed / MINUTE_MS)} minutes ago. Wait ${Math.ceil((RECENT_RUN_MS - elapsed) / MINUTE_MS)} minutes more, so two browsers are not on the session at once.`
   }

   return undefined
}
