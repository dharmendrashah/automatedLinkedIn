import { type Account, type AccountStatus } from './types'

export const VISIT_TASK = 'linkedin-browse'

// Why the daily visit cannot start from this account's row, or undefined when it can. `hasWorkingProxy` is undefined while
// the proxies are still loading.
export const visitBlocker = (status: AccountStatus, hasWorkingProxy: boolean | undefined) => {
   if (status === 'DISABLED') {
      return 'Resume the account before a visit.'
   }

   if (status !== 'ACTIVE') {
      return 'The visit needs an account that is signed in. Run Test login first.'
   }

   if (hasWorkingProxy === false) {
      return 'Add a proxy that works first: visits never go out directly.'
   }

   return undefined
}

// What to say instead of a time for the next visit; undefined when a time is planned.
export const nextVisitNote = (status: AccountStatus, nextBrowseAt: string | Date | null) => {
   if (status === 'DISABLED') {
      return 'Paused'
   }

   if (status !== 'ACTIVE') {
      return 'After the account signs in'
   }

   return nextBrowseAt ? undefined : 'Soon'
}

export const visitRunning = ({ lastVisit }: { lastVisit: Pick<NonNullable<Account['lastVisit']>, 'status'> | null }) =>
   lastVisit?.status === 'IN_PROGRESS'
