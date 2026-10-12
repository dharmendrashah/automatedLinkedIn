import { type AccountStatus } from './types'

export const LOGIN_TASK = 'linkedin-login'

// Why the login test cannot start from this account's row, or undefined when it can. `hasWorkingProxy` is undefined while
// the proxies are still loading.
export const loginTestBlocker = (status: AccountStatus, hasWorkingProxy: boolean | undefined) => {
   if (status === 'DISABLED') {
      return 'Resume the account before testing it.'
   }

   if (hasWorkingProxy === false) {
      return 'Add a proxy that works first: logins never go out directly.'
   }

   return undefined
}
