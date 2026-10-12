import { type ProxyStatus } from './types'

export const BROWSER_TEST_TASK = 'browser-detection'

// Why the browser test cannot start from this proxy's row, or undefined when it can. The spider never goes out from this
// server, so the proxy has to work.
export const browserTestBlocker = (status: ProxyStatus, announced: boolean) => {
   if (!announced) {
      return 'The spider worker has not announced the browser test yet.'
   }

   if (status !== 'ACTIVE' && status !== 'GEO_MISMATCH') {
      return 'Test the proxy first: the browser test needs a proxy that works.'
   }

   return undefined
}
